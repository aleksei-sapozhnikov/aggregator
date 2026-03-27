#!/usr/bin/env python3
"""Install pinned QA tooling and optionally install local git hooks."""

from __future__ import annotations

import argparse
import subprocess
import sys
from pathlib import Path


def repo_root() -> Path:
    """Return repository root directory based on this script location."""
    return Path(__file__).resolve().parent.parent


def run(cmd: list[str]) -> int:
    """Run a command in repository root and return its exit code."""
    result = subprocess.run(cmd, cwd=repo_root(), check=False)
    return result.returncode


def install_prek(version: str) -> int:
    """Install pinned prek version via pip."""
    return run(
        [sys.executable, "-m", "pip", "install", "--upgrade", f"prek=={version}"]
    )


def install_hooks() -> int:
    """Install git hooks by delegating to the QA entrypoint."""
    return run(
        [
            sys.executable,
            "tools/code_qa.py",
            "install-hooks",
        ]
    )


def build_parser() -> argparse.ArgumentParser:
    """Build CLI parser for tool setup options."""
    parser = argparse.ArgumentParser(description="Install local QA tooling.")
    parser.add_argument(
        "--prek-version",
        required=True,
        help="Pinned prek version to install.",
    )
    parser.add_argument(
        "--install-hooks",
        action="store_true",
        help="Install git hooks after tool installation.",
    )
    return parser


def main() -> int:
    """Run tool setup workflow from CLI arguments."""
    args = build_parser().parse_args()

    print(f"Installing prek=={args.prek_version}...")
    rc = install_prek(args.prek_version)
    if rc != 0:
        return rc

    if args.install_hooks:
        print("Installing git hooks...")
        rc = install_hooks()
        if rc != 0:
            return rc

    print("Done")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
