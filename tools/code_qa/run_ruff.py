#!/usr/bin/env python3
"""Lint and format Python files with Ruff."""

from __future__ import annotations

import argparse
import shutil
import subprocess

from utils import ensure_python_with_module, iter_repo_files, repo_root


def resolve_ruff_cmd() -> list[str] | None:
    """Resolve an executable command for Ruff."""
    if shutil.which("ruff"):
        return ["ruff"]
    python_with_ruff = ensure_python_with_module("ruff", "ruff")
    if python_with_ruff is None:
        return None
    return [python_with_ruff, "-m", "ruff"]


def build_parser() -> argparse.ArgumentParser:
    """Create CLI parser for Ruff modes."""
    parser = argparse.ArgumentParser(description="Run ruff in check-only or format mode.")
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--check-only", action="store_true")
    group.add_argument("--format", action="store_true")
    return parser


def main() -> int:
    """Run Ruff lint/format flow for Python files."""
    args = build_parser().parse_args()
    cmd = resolve_ruff_cmd()
    if cmd is None:
        print("ruff is not installed and local venv bootstrap failed.")
        return 1
    root = repo_root()
    files = [
        str(path.relative_to(root))
        for path in iter_repo_files()
        if path.suffix.lower() in {".py", ".pyi"}
    ]
    if not files:
        return 0
    if args.check_only:
        return subprocess.run([*cmd, "check", "--no-fix", *files], cwd=root, check=False).returncode
    rc = subprocess.run([*cmd, "check", "--fix", *files], cwd=root, check=False).returncode
    if rc != 0:
        return rc
    return subprocess.run([*cmd, "format", *files], cwd=root, check=False).returncode


if __name__ == "__main__":
    raise SystemExit(main())
