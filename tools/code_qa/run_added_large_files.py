#!/usr/bin/env python3
"""Detect files that exceed the configured repository size limit."""

from __future__ import annotations

from utils import iter_repo_files, repo_root

LARGE_FILE_LIMIT_BYTES = 500 * 1024


def main() -> int:
    failed = False
    root = repo_root()
    for path in iter_repo_files():
        try:
            size = path.stat().st_size
        except OSError:
            continue
        if size > LARGE_FILE_LIMIT_BYTES:
            print(f"{path.relative_to(root)}: {size} bytes")
            failed = True
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
