#!/usr/bin/env python3
"""Detect and trim trailing whitespace in text files."""

from __future__ import annotations

import argparse

from utils import iter_repo_files, read_text, repo_root


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Check or trim trailing whitespace.")
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--check-only", action="store_true")
    group.add_argument("--format", action="store_true")
    return parser


def main() -> int:
    """Run trailing whitespace check or format."""
    args = build_parser().parse_args()
    failed = False
    changed = 0
    root = repo_root()
    for path in iter_repo_files():
        text = read_text(path)
        if text is None:
            continue
        if args.check_only:
            for idx, line in enumerate(text.splitlines(), start=1):
                if line.endswith((" ", "\t")):
                    print(f"{path.relative_to(root)}:{idx}: trailing whitespace")
                    failed = True
            continue
        lines = text.splitlines(keepends=True)
        normalized = "".join(
            [
                line.rstrip("\r\n").rstrip(" \t") + ("\n" if line.endswith(("\n", "\r")) else "")
                for line in lines
            ]
        )
        if normalized != text:
            path.write_text(normalized, encoding="utf-8")
            changed += 1
    if args.format and changed:
        print(f"trimmed trailing whitespace in {changed} files")
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
