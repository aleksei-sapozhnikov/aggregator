#!/usr/bin/env python3
"""Check text files for exactly one trailing newline at end of file."""

from __future__ import annotations

import sys
from pathlib import Path


def is_binary(content: bytes) -> bool:
    """Return True when file bytes look binary."""
    return b"\x00" in content


def main() -> int:
    """Validate that each provided text file ends with exactly one newline."""
    failed = False
    for raw_path in sys.argv[1:]:
        path = Path(raw_path)
        if not path.exists() or not path.is_file():
            continue

        data = path.read_bytes()
        if is_binary(data):
            continue

        text = data.decode("utf-8", errors="surrogateescape")
        if text and not text.endswith("\n"):
            print(f"{path}: missing final newline")
            failed = True
        if text.endswith("\n\n"):
            print(f"{path}: more than one trailing newline at end of file")
            failed = True

    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
