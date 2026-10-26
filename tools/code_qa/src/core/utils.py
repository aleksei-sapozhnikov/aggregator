"""Shared utility helpers for code_qa scripts."""

from __future__ import annotations

import os
import subprocess
import sys
from collections.abc import Callable
from pathlib import Path

EXCLUDED_DIRS = {
    ".git",
    ".idea",
    ".venv",
    ".temp",
    ".ruff_cache",
    ".terraform",
    ".tflint.d",
    "__pycache__",
    "node_modules",
    "target",
    "build",
    "dist",
}
SCOPED_FILES_ENV = "CODE_QA_FILE_LIST"
QA_RUNTIME_DIR = "qa-runtime"


def repo_root() -> Path:
    """Return repository root directory for QA scripts."""
    return project_dir().parent.parent


def project_dir() -> Path:
    """Return the QA project directory containing requirements.txt."""
    return Path(__file__).resolve().parents[2]


def runtime_dir(root: Path | None = None) -> Path:
    """Return the ignored, repository-local home for QA tools and caches."""
    return (root or repo_root()) / ".temp" / QA_RUNTIME_DIR


def dependency_environment() -> dict[str, str]:
    """Build the shared environment for code_qa subprocesses."""
    env = os.environ.copy()
    existing_path = env.get("PYTHONPATH", "")
    env["PYTHONPATH"] = str(project_dir().parent) + (
        os.pathsep + existing_path if existing_path else ""
    )
    return env


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
        print(message, flush=True)
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


def run_module(
    module_name: str,
    module_args: list[str] | None = None,
) -> tuple[bool, list[str]]:
    """Execute a Python check module and preserve all diagnostic lines."""
    args = module_args or []
    env = dependency_environment()
    env["PYTHONIOENCODING"] = "utf-8"
    result = subprocess.run(
        [sys.executable, "-m", module_name, *args],
        cwd=repo_root(),
        check=False,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        env=env,
    )
    details: list[str] = []
    if result.stdout:
        details.extend([line for line in result.stdout.splitlines() if line.strip()])
    if result.stderr:
        details.extend([line for line in result.stderr.splitlines() if line.strip()])
    return result.returncode == 0, details


def is_excluded(path: Path) -> bool:
    """Check whether path belongs to excluded directories."""
    return any(part in EXCLUDED_DIRS for part in path.parts)


def iter_repo_files(root: Path) -> list[Path]:
    """Return repository files without applying module or hook policy."""
    git_files = list_git_files(root)
    return git_files if git_files is not None else list_walk_files(root)


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


def scoped_paths(root: Path) -> list[Path] | None:
    """Read hook paths, retaining deleted files so they can trigger module checks."""
    raw = os.environ.get(SCOPED_FILES_ENV, "").strip()
    if not raw:
        return None
    scope_file = Path(raw)
    try:
        content = scope_file.read_text(encoding="utf-8")
    except OSError:
        return []

    scoped: list[Path] = []
    for line in content.splitlines():
        rel = line.strip().replace("\\", "/")
        if not rel:
            continue
        scoped.append((root / rel).resolve())
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
        except (OSError, ValueError):
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
