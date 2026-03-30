#!/usr/bin/env python3
"""Install local git hooks."""

from __future__ import annotations

import argparse
import shutil
import subprocess
import sys
import sysconfig
from pathlib import Path


def repo_root() -> Path:
    """Return repository root directory based on this script location."""
    return Path(__file__).resolve().parent.parent


def build_parser() -> argparse.ArgumentParser:
    """Build CLI parser for git hook setup command."""
    return argparse.ArgumentParser(description="Install local git hooks.")


def resolve_prek() -> str:
    """Resolve prek executable path or exit with a readable error."""
    found = shutil.which("prek")
    if found:
        return found

    scripts_dir = Path(sysconfig.get_path("scripts"))
    for candidate in (scripts_dir / "prek", scripts_dir / "prek.exe"):
        if candidate.exists():
            return str(candidate)

    print(
        "error: prek executable not found. Install it first using tools/setup_prek.py.",
        file=sys.stderr,
    )
    raise SystemExit(1)


def main() -> int:
    """Install pre-commit and pre-push hooks."""
    _ = build_parser().parse_args()
    prek = resolve_prek()
    result = subprocess.run(
        [prek, "install", "-f", "--hook-type", "pre-commit", "--hook-type", "pre-push"],
        cwd=repo_root(),
        check=False,
    )
    return result.returncode


if __name__ == "__main__":
    raise SystemExit(main())
