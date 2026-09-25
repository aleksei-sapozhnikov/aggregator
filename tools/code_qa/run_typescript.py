"""Run npm-backed TypeScript type checks for repository packages."""

from __future__ import annotations

import json
import os
import subprocess
import sys
from pathlib import Path

from utils import (
    SCOPED_FILES_ENV,
    is_excluded,
    list_git_files,
    list_walk_files,
    repo_root,
)

TYPECHECK_TRIGGER_SUFFIXES = {
    ".cjs",
    ".cts",
    ".js",
    ".jsx",
    ".mjs",
    ".mts",
    ".ts",
    ".tsx",
}
TYPECHECK_TRIGGER_NAMES = {
    "package.json",
    "package-lock.json",
    "vite.config.js",
    "vite.config.mjs",
    "vite.config.ts",
}


def npm_command() -> str:
    """Return npm executable name for the current platform."""
    return "npm.cmd" if sys.platform == "win32" else "npm"


def load_json(path: Path) -> dict[str, object] | None:
    """Load a JSON object from disk."""
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, UnicodeDecodeError, json.JSONDecodeError):
        return None
    return data if isinstance(data, dict) else None


def has_typecheck_script(package_json: Path) -> bool:
    """Return whether package.json declares an npm typecheck script."""
    data = load_json(package_json)
    if data is None:
        return False
    scripts = data.get("scripts")
    return isinstance(scripts, dict) and isinstance(scripts.get("typecheck"), str)


def typecheck_packages(root: Path) -> list[Path]:
    """Find npm packages that declare a typecheck script."""
    packages: list[Path] = []
    files = list_git_files(root)
    for package_json in files if files is not None else list_walk_files(root):
        if package_json.name != "package.json":
            continue
        rel = package_json.relative_to(root)
        if is_excluded(rel):
            continue
        if has_typecheck_script(package_json):
            packages.append(package_json.parent)
    return sorted(packages)


def scoped_paths(root: Path) -> list[Path] | None:
    """Read scoped file paths from the hook environment when present."""
    raw = os.environ.get(SCOPED_FILES_ENV, "").strip()
    if not raw:
        return None

    try:
        lines = Path(raw).read_text(encoding="utf-8").splitlines()
    except OSError:
        return []

    paths: list[Path] = []
    for line in lines:
        rel = line.strip().replace("\\", "/")
        if rel:
            paths.append((root / rel).resolve())
    return paths


def is_typecheck_trigger(path: Path) -> bool:
    """Return whether a changed path should trigger a package typecheck."""
    name = path.name
    return (
        path.suffix.lower() in TYPECHECK_TRIGGER_SUFFIXES
        or name in TYPECHECK_TRIGGER_NAMES
        or (name.startswith("tsconfig") and name.endswith(".json"))
    )


def package_in_scope(package_dir: Path, scope: list[Path] | None) -> bool:
    """Return whether a package should run under the current file scope."""
    if scope is None:
        return True

    for path in scope:
        try:
            rel = path.relative_to(package_dir)
        except ValueError:
            continue
        if is_excluded(rel):
            continue
        if is_typecheck_trigger(path):
            return True
    return False


def can_run_npm(npm: str) -> bool:
    """Return whether npm is available."""
    try:
        result = subprocess.run(
            [npm, "--version"],
            cwd=repo_root(),
            check=False,
            capture_output=True,
            text=True,
        )
    except OSError:
        return False
    return result.returncode == 0


def has_local_tsc(package_dir: Path) -> bool:
    """Return whether the package has a local TypeScript compiler installed."""
    bin_dir = package_dir / "node_modules" / ".bin"
    tsc = bin_dir / ("tsc.cmd" if sys.platform == "win32" else "tsc")
    return tsc.exists()


def ensure_package_dependencies(npm: str, package_dir: Path) -> int:
    """Install package dependencies when the local TypeScript compiler is absent."""
    if has_local_tsc(package_dir):
        return 0

    if not (package_dir / "package-lock.json").exists():
        rel = package_dir.relative_to(repo_root())
        print(f"{rel}: missing package-lock.json for npm ci")
        return 1

    return subprocess.run([npm, "ci"], cwd=package_dir, check=False).returncode


def main() -> int:
    """Run npm typecheck in each relevant TypeScript package."""
    root = repo_root()
    npm = npm_command()
    if not can_run_npm(npm):
        print("npm is not installed or not available in PATH.")
        return 1

    scope = scoped_paths(root)
    packages = [
        package_dir
        for package_dir in typecheck_packages(root)
        if package_in_scope(package_dir, scope)
    ]
    if not packages:
        return 0

    failed = False
    for package_dir in packages:
        rel = package_dir.relative_to(root)
        install_rc = ensure_package_dependencies(npm, package_dir)
        if install_rc != 0:
            failed = True
            continue

        print(f"{rel}: npm run typecheck", flush=True)
        result = subprocess.run([npm, "run", "typecheck"], cwd=package_dir, check=False)
        if result.returncode != 0:
            failed = True

    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
