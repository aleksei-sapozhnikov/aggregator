"""Lint and format Python files with Ruff."""

from __future__ import annotations

import argparse
import subprocess
from pathlib import Path

from code_qa.src.core.inputs import add_file_arguments, file_inputs
from code_qa.src.tools.python import (
    ensure_python_with_module,
    python_environment,
)


def resolve_ruff_cmd(root: Path | None = None) -> list[str] | None:
    """Resolve an executable command for Ruff."""
    python_with_ruff = ensure_python_with_module("ruff", root)
    if python_with_ruff is None:
        return None
    return [python_with_ruff, "-m", "ruff"]


def run_ruff(
    command: list[str], operation: list[str], files: list[str], root: Path
) -> int:
    """Run one Ruff operation with the local cache settings."""
    return subprocess.run(
        [*command, *operation, *files],
        cwd=root,
        env=python_environment(root),
        check=False,
    ).returncode


def build_parser() -> argparse.ArgumentParser:
    """Create CLI parser for Ruff modes."""
    parser = argparse.ArgumentParser(
        description="Run ruff in check-only or format mode."
    )
    add_file_arguments(parser)
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--check-only", action="store_true")
    group.add_argument("--format", action="store_true")
    group.add_argument("--lint-check-only", action="store_true")
    group.add_argument("--format-check-only", action="store_true")
    group.add_argument("--lint-fix", action="store_true")
    group.add_argument("--format-fix", action="store_true")
    return parser


def main() -> int:
    """Run Ruff lint/format flow for Python files."""
    args = build_parser().parse_args()
    inputs = file_inputs(args)
    root = inputs.root
    cmd = resolve_ruff_cmd(root)
    if cmd is None:
        print("ruff is not installed and local venv bootstrap failed.")
        return 1
    files = [
        str(path.relative_to(root))
        for path in inputs.files
        if path.suffix.lower() in {".py", ".pyi"}
    ]
    if not files:
        return 0
    if args.lint_check_only:
        return run_ruff(cmd, ["check", "--no-fix"], files, root)
    if args.format_check_only:
        return run_ruff(cmd, ["format", "--check"], files, root)
    if args.lint_fix:
        return run_ruff(cmd, ["check", "--fix"], files, root)
    if args.format_fix:
        return run_ruff(cmd, ["format"], files, root)
    if args.check_only:
        lint_rc = run_ruff(cmd, ["check", "--no-fix"], files, root)
        format_rc = run_ruff(cmd, ["format", "--check"], files, root)
        return 0 if lint_rc == 0 and format_rc == 0 else 1
    lint_rc = run_ruff(cmd, ["check", "--fix"], files, root)
    format_rc = run_ruff(cmd, ["format"], files, root)
    return lint_rc or format_rc


if __name__ == "__main__":
    raise SystemExit(main())
