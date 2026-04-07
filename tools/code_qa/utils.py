#!/usr/bin/env python3
"""Shared utility helpers for code_qa scripts."""

from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path
from typing import Callable

EXCLUDED_DIRS = {
    ".git",
    ".idea",
    ".venv",
    ".temp",
    ".ruff_cache",
    "__pycache__",
    "node_modules",
    "target",
    "build",
    "dist",
}
PRETTIER_VERSION = "3.6.2"
SCOPED_FILES_ENV = "CODE_QA_FILE_LIST"
QA_RUNTIME_DIR = "qa-runtime"


def repo_root() -> Path:
    """Return repository root directory for QA scripts."""
    return Path(__file__).resolve().parent.parent.parent


def script_dir() -> Path:
    """Return directory that contains code_qa scripts."""
    return Path(__file__).resolve().parent


def build_emitter(
    out_file: str, append: bool = False
) -> tuple[Callable[[str], None], Callable[[str], None], Callable[[], None]]:
    """Build console/file emitters with optional file output."""
    handle = None
    if out_file:
        out_path = Path(out_file).resolve()
        out_path.parent.mkdir(parents=True, exist_ok=True)
        mode = "a" if append else "w"
        handle = out_path.open(mode, encoding="utf-8")

    def emit(message: str) -> None:
        print(message)
        if handle:
            handle.write(message + "\n")

    def emit_file_only(message: str) -> None:
        if handle:
            handle.write(message + "\n")

    def close() -> None:
        if handle:
            handle.close()

    return emit, emit_file_only, close


def emit_final_summary(emit: Callable[[str], None], ok: bool) -> None:
    """Emit unified final QA status line."""
    emit(f"=== QA: {'PASSED' if ok else 'FAILED'} ===")


def parse_secrets_summary(output: str) -> tuple[str, int] | None:
    """Parse concise secrets summary from scanner output."""
    for line in output.splitlines():
        stripped = line.strip()
        if stripped.startswith("OK: ") and stripped.endswith(" secrets found"):
            parts = stripped.split()
            if len(parts) >= 2 and parts[1].isdigit():
                return "OK", int(parts[1])
        if stripped.startswith("FAILED: ") and "potential secret(s) found" in stripped:
            parts = stripped.split()
            if len(parts) >= 2 and parts[1].isdigit():
                return "FAILED", int(parts[1])
    return None


def run_script(script_name: str, script_args: list[str] | None = None) -> tuple[bool, list[str]]:
    """Execute QA helper script and return status with short details."""
    script = script_dir() / script_name
    args = script_args or []
    result = subprocess.run(
        [sys.executable, str(script), *args],
        cwd=repo_root(),
        check=False,
        capture_output=True,
        text=True,
    )
    details: list[str] = []
    if result.stdout:
        details.extend([line for line in result.stdout.splitlines() if line.strip()])
    if result.stderr:
        details.extend([line for line in result.stderr.splitlines() if line.strip()])
    return result.returncode == 0, details[:12]


def is_excluded(path: Path) -> bool:
    """Check whether path belongs to excluded directories."""
    return any(part in EXCLUDED_DIRS for part in path.parts)


def iter_repo_files() -> list[Path]:
    """Return repository files, optionally constrained by scoped mode."""
    root = repo_root()
    git_files = list_git_files(root)
    files = git_files if git_files is not None else list_walk_files(root)
    scoped = scoped_files(root)
    if scoped is None:
        return files
    return [path for path in files if path.resolve() in scoped]

def list_walk_files(root: Path) -> list[Path]:
    """Collect files by recursive walk while honoring exclusions."""
    files: list[Path] = []
    for path in root.rglob("*"):
        if not path.is_file():
            continue
        rel = path.relative_to(root)
        if is_excluded(rel):
            continue
        files.append(path)
    return files


def scoped_files(root: Path) -> set[Path] | None:
    """Read scoped file list from environment when provided."""
    raw = os.environ.get(SCOPED_FILES_ENV, "").strip()
    if not raw:
        return None
    scope_file = Path(raw)
    try:
        content = scope_file.read_text(encoding="utf-8")
    except OSError:
        return set()

    scoped: set[Path] = set()
    for line in content.splitlines():
        rel = line.strip().replace("\\", "/")
        if not rel:
            continue
        candidate = (root / rel).resolve()
        if candidate.is_file():
            scoped.add(candidate)
    return scoped


def list_git_files(root: Path) -> list[Path] | None:
    """Return git-tracked + untracked (non-ignored) files, or None when unavailable."""
    result = subprocess.run(
        [
            "git",
            "-C",
            str(root),
            "ls-files",
            "-z",
            "--cached",
            "--others",
            "--exclude-standard",
        ],
        check=False,
        capture_output=True,
        text=False,
    )
    if result.returncode != 0:
        return None

    files: list[Path] = []
    for raw in result.stdout.split(b"\x00"):
        if not raw:
            continue
        try:
            rel = Path(raw.decode("utf-8", errors="surrogateescape"))
        except Exception:
            continue
        if is_excluded(rel):
            continue
        path = (root / rel).resolve()
        if path.is_file():
            files.append(path)
    return files


def is_binary(data: bytes) -> bool:
    """Detect binary content from raw bytes."""
    return b"\x00" in data


def read_text(path: Path) -> str | None:
    """Read file as text when decodable and non-binary."""
    try:
        data = path.read_bytes()
    except OSError:
        return None
    if is_binary(data):
        return None
    return data.decode("utf-8", errors="surrogateescape")


def venv_dir() -> Path:
    """Return directory used for local Python runtime artifacts."""
    return repo_root() / ".temp" / QA_RUNTIME_DIR / "venv"


def venv_python() -> Path:
    """Return Python executable path inside local virtual environment."""
    if sys.platform == "win32":
        return venv_dir() / "Scripts" / "python.exe"
    return venv_dir() / "bin" / "python"


def ensure_venv() -> Path | None:
    """Ensure local virtual environment exists and return Python path."""
    py = venv_python()
    if py.exists():
        return py
    venv_dir().parent.mkdir(parents=True, exist_ok=True)
    result = subprocess.run(
        [sys.executable, "-m", "venv", str(venv_dir())],
        cwd=repo_root(),
        check=False,
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        return None
    return py if py.exists() else None


def python_has_module(python_exe: str | Path, module_name: str) -> bool:
    """Check whether selected Python can import a module."""
    result = subprocess.run(
        [str(python_exe), "-c", f"import {module_name}"],
        cwd=repo_root(),
        check=False,
        capture_output=True,
        text=True,
    )
    return result.returncode == 0


def ensure_python_with_module(module_name: str, package_name: str) -> str | None:
    """Resolve Python interpreter that provides requested module."""
    if python_has_module(sys.executable, module_name):
        return sys.executable

    py = ensure_venv()
    if py is None:
        return None
    if python_has_module(py, module_name):
        return str(py)

    install = subprocess.run(
        [str(py), "-m", "pip", "install", "--upgrade", package_name],
        cwd=repo_root(),
        check=False,
        capture_output=True,
        text=True,
    )
    if install.returncode != 0:
        return None
    return str(py) if python_has_module(py, module_name) else None


def prettier_bin_path() -> Path:
    """Return expected local Prettier executable path."""
    bin_dir = repo_root() / ".temp" / QA_RUNTIME_DIR / "node_modules" / ".bin"
    if sys.platform == "win32":
        return bin_dir / "prettier.cmd"
    return bin_dir / "prettier"


def can_run_command(cmd: list[str]) -> bool:
    """Probe whether command is runnable via version check."""
    try:
        result = subprocess.run(
            [*cmd, "--version"],
            cwd=repo_root(),
            check=False,
            capture_output=True,
            text=True,
        )
    except OSError:
        return False
    return result.returncode == 0


def ensure_prettier_cmd() -> list[str] | None:
    """Resolve Prettier command from PATH or local runtime setup."""
    if can_run_command(["prettier"]):
        return ["prettier"]

    local_prettier = prettier_bin_path()
    if local_prettier.exists() and can_run_command([str(local_prettier)]):
        return [str(local_prettier)]

    npm = "npm.cmd" if sys.platform == "win32" else "npm"
    try:
        npm_probe = subprocess.run(
            [npm, "--version"],
            cwd=repo_root(),
            check=False,
            capture_output=True,
            text=True,
        )
    except OSError:
        return None
    if npm_probe.returncode != 0:
        return None

    try:
        install = subprocess.run(
            [
                npm,
                "install",
                "--no-audit",
                "--no-fund",
                "--prefix",
                str(repo_root() / ".temp" / QA_RUNTIME_DIR),
                f"prettier@{PRETTIER_VERSION}",
            ],
            cwd=repo_root(),
            check=False,
            capture_output=True,
            text=True,
        )
    except OSError:
        return None
    if install.returncode != 0:
        return None
    if local_prettier.exists() and can_run_command([str(local_prettier)]):
        return [str(local_prettier)]
    return None
