"""Internal adapter for lightweight Git hook checks.

Public repository QA is exposed exclusively through qa-check and qa-format.
Git hooks keep their scoped, no-tests workflows to avoid costly commits.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / "tools"))

from code_qa.module_checks.common.secrets import run_secrets_command  # noqa: E402
from code_qa.src.core.cli import (  # noqa: E402
    run_check_command,
    run_format_command,
)


def main() -> int:
    parser = argparse.ArgumentParser(description="Internal Git hook QA actions.")
    parser.add_argument("mode", choices=("check", "format", "secrets"))
    args = parser.parse_args()
    if args.mode == "check":
        return run_check_command()
    if args.mode == "format":
        return run_format_command()
    return run_secrets_command()


if __name__ == "__main__":
    raise SystemExit(main())
