#!/usr/bin/env python3
"""Check text files for trailing spaces or tabs at line ends."""

from __future__ import annotations

import sys
from pathlib import Path


def is_binary(content: bytes) -> bool:
    """Return True when file bytes look binary."""
    return b"\x00" in content


def main() -> int:
    """Validate that provided text files have no trailing whitespace."""
    failed = False
    for raw_path in sys.argv[1:]:
        path = Path(raw_path)
        if not path.exists() or not path.is_file():
            continue

        data = path.read_bytes()
        if is_binary(data):
            continue

        text = data.decode("utf-8", errors="surrogateescape")
        for idx, line in enumerate(text.splitlines(), start=1):
            if line.endswith((" ", "\t")):
                print(f"{path}:{idx}: trailing whitespace")
                failed = True

    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
