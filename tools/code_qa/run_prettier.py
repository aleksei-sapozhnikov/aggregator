#!/usr/bin/env python3
"""Check and apply formatting for Prettier-supported files."""

from __future__ import annotations

import argparse
import subprocess

from utils import ensure_prettier_cmd, iter_repo_files, repo_root

PRETTIER_SUFFIXES = {
    ".js",
    ".mjs",
    ".cjs",
    ".ts",
    ".mts",
    ".cts",
    ".jsx",
    ".tsx",
    ".json",
    ".yaml",
    ".yml",
    ".md",
    ".css",
    ".html",
}


def build_parser() -> argparse.ArgumentParser:
    """Create CLI parser for Prettier modes."""
    parser = argparse.ArgumentParser(description="Run prettier in check-only or format mode.")
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--check-only", action="store_true")
    group.add_argument("--format", action="store_true")
    return parser


def main() -> int:
    """Run Prettier check or write mode for supported files."""
    args = build_parser().parse_args()
    prettier_cmd = ensure_prettier_cmd()
    if prettier_cmd is None:
        print("prettier is not installed and local install failed (npm unavailable?).")
        return 1
    root = repo_root()
    files = [
        str(path.relative_to(root))
        for path in iter_repo_files()
        if path.suffix.lower() in PRETTIER_SUFFIXES
    ]
    if not files:
        return 0
    if args.check_only:
        return subprocess.run(
            [*prettier_cmd, "--check", *files], cwd=root, check=False
        ).returncode
    return subprocess.run([*prettier_cmd, "--write", *files], cwd=root, check=False).returncode


if __name__ == "__main__":
    raise SystemExit(main())
