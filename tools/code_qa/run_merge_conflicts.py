#!/usr/bin/env python3
"""Detect unresolved Git merge conflict markers in text files."""

from __future__ import annotations

import re

from utils import iter_repo_files, read_text, repo_root

CONFLICT_MARKERS_RE = re.compile(
    r"(?m)^(<<<<<<< .+|=======|>>>>>>> .+)$"
)


def main() -> int:
    failed = False
    root = repo_root()
    for path in iter_repo_files():
        text = read_text(path)
        if text is None:
            continue
        if CONFLICT_MARKERS_RE.search(text):
            print(str(path.relative_to(root)))
            failed = True
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
