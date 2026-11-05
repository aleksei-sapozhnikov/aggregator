"""Run scoped Git hook code checks without full module tests."""

from __future__ import annotations

import argparse
import importlib
import sys
from pathlib import Path


def main() -> int:
    """Run a lightweight, changed-file-only QA check or format."""
    parser = argparse.ArgumentParser(description="Internal Git hook QA actions.")
    parser.add_argument("mode", choices=("check", "format"))
    args = parser.parse_args()

    root = Path(__file__).resolve().parents[3]
    sys.path.insert(0, str(root / "tools"))
    # Load after adding the repository-local tools directory to sys.path.
    cli = importlib.import_module("code_qa.src.core.cli")

    if args.mode == "check":
        return cli.run_check_command()
    return cli.run_format_command()


if __name__ == "__main__":
    raise SystemExit(main())
