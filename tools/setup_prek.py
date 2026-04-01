#!/usr/bin/env python3
"""Install pinned prek tooling."""

from __future__ import annotations

import argparse
import os
import subprocess
import sys
from pathlib import Path

DEFAULT_PREK_VERSION = "0.3.6"


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


def build_parser() -> argparse.ArgumentParser:
    """Build CLI parser for prek setup options."""
    parser = argparse.ArgumentParser(description="Install local prek tooling.")
    parser.add_argument(
        "--prek-version",
        default=os.environ.get("PREK_VERSION", DEFAULT_PREK_VERSION),
        help=(
            "Pinned prek version to install "
            f"(default: {DEFAULT_PREK_VERSION}, can be overridden by PREK_VERSION env)."
        ),
    )
    return parser


def main() -> int:
    """Run prek setup workflow from CLI arguments."""
    args = build_parser().parse_args()
    print(f"Installing prek=={args.prek_version}...")
    rc = install_prek(args.prek_version)
    if rc != 0:
        return rc
    print("Done")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
