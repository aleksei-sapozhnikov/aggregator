"""Validate and normalize line endings in text files."""

from __future__ import annotations

import argparse

from code_qa.src.core.inputs import add_file_arguments, file_inputs
from code_qa.src.core.utils import read_text


def build_parser() -> argparse.ArgumentParser:
    """Create CLI parser for line-ending modes."""
    parser = argparse.ArgumentParser(description="Check or normalize line endings.")
    add_file_arguments(parser)
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--check-only", action="store_true")
    group.add_argument("--format", action="store_true")
    return parser


def main() -> int:
    """Run line-ending check or normalization."""
    args = build_parser().parse_args()
    failed = False
    changed = 0
    inputs = file_inputs(args)
    root = inputs.root
    for path in inputs.files:
        text = read_text(path)
        if text is None:
            continue
        if "\r" not in text:
            continue
        if args.check_only:
            print(str(path.relative_to(root)))
            failed = True
        else:
            path.write_text(
                text.replace("\r\n", "\n").replace("\r", "\n"),
                encoding="utf-8",
                newline="\n",
            )
            changed += 1
    if args.format and changed:
        print(f"normalized line endings in {changed} files")
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
