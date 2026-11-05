"""Internal adapter for lightweight Git hook checks.

Public repository QA is exposed exclusively through qa-check and qa-format.
Git hooks keep their scoped, no-tests workflows to avoid costly commits.
"""

from __future__ import annotations

import argparse
import importlib
import sys
from pathlib import Path



def main() -> int:
    parser = argparse.ArgumentParser(description="Internal Git hook QA actions.")
    parser.add_argument("mode", choices=("check", "format", "secrets"))
    args = parser.parse_args()
    root = Path(__file__).resolve().parents[3]
    sys.path.insert(0, str(root / "tools"))
    cli = importlib.import_module("code_qa.src.core.cli")
    if args.mode == "check":
        return cli.run_check_command()
    if args.mode == "format":
        return cli.run_format_command()
    secrets = importlib.import_module("code_qa.module_checks.common.secrets")
    return secrets.run_secrets_command()


if __name__ == "__main__":
    raise SystemExit(main())
