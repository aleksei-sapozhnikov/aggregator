#!/usr/bin/env python3
"""Validate and normalize final newline at end of text files."""

from __future__ import annotations

import argparse

from utils import iter_repo_files, read_text, repo_root


def build_parser() -> argparse.ArgumentParser:
    """Create CLI parser for final-newline modes."""
    parser = argparse.ArgumentParser(description="Check or normalize final newline.")
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--check-only", action="store_true")
    group.add_argument("--format", action="store_true")
    return parser


def main() -> int:
    """Run final newline check or format."""
    args = build_parser().parse_args()
    failed = False
    changed = 0
    root = repo_root()
    for path in iter_repo_files():
        text = read_text(path)
        if text is None:
            continue
        if args.check_only:
            if text and not text.endswith("\n"):
                print(f"{path.relative_to(root)}: missing final newline")
                failed = True
            elif text.endswith("\n\n"):
                print(f"{path.relative_to(root)}: more than one trailing newline at end of file")
                failed = True
            continue
        fixed = text.rstrip("\n")
        if fixed:
            fixed = fixed + "\n"
        if fixed != text:
            path.write_text(fixed, encoding="utf-8")
            changed += 1
    if args.format and changed:
        print(f"normalized final newline in {changed} files")
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
