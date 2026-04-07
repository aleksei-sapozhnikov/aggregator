#!/usr/bin/env python3
"""Validate JSON file syntax by parsing JSON documents."""

from __future__ import annotations

import json

from utils import iter_repo_files, repo_root


def main() -> int:
    failed = False
    root = repo_root()
    for path in iter_repo_files():
        if path.suffix.lower() != ".json":
            continue
        try:
            json.loads(path.read_text(encoding="utf-8"))
        except Exception as exc:
            print(f"{path.relative_to(root)}: {exc}")
            failed = True
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
