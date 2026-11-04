"""Prepare Publisher's local Lambda artifact before OpenTofu validation."""

from __future__ import annotations

import argparse
import subprocess
import sys
from pathlib import Path


def run(directory: Path, workspace: Path) -> int:
    """Build the ignored ZIP required by publisher resource validation."""
    publisher = workspace / "tools/publisher"
    expected_root = publisher / "infra/resources"
    if directory.resolve() != expected_root.resolve():
        print(f"Unexpected Publisher OpenTofu directory: {directory}")
        return 1
    script = publisher / "publisher.py"
    if not script.is_file():
        print(f"Missing Publisher build script: {script}")
        return 1
    result = subprocess.run(
        [sys.executable, str(script), "build"],
        cwd=publisher,
        check=False,
    )
    if result.returncode:
        return result.returncode
    archive = publisher / "build/publisher.zip"
    if not archive.is_file():
        print(f"Publisher build did not produce the required artifact: {archive}")
        return 1
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--directory", type=Path, required=True)
    parser.add_argument("--workspace-root", type=Path, required=True)
    parser.add_argument("--changed-files-from", type=Path)
    args = parser.parse_args()
    return run(args.directory, args.workspace_root)


if __name__ == "__main__":
    raise SystemExit(main())
