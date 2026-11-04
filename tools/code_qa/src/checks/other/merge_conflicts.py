"""Detect unresolved Git merge conflict markers in text files."""

from __future__ import annotations

import re

from code_qa.src.core.inputs import parse_file_inputs
from code_qa.src.core.utils import read_text

CONFLICT_MARKERS_RE = re.compile(r"(?m)^(<<<<<<< .+|=======|>>>>>>> .+)$")


def main() -> int:
    """Detect unresolved merge markers in text files."""
    failed = False
    inputs = parse_file_inputs()
    root = inputs.root
    for path in inputs.files:
        text = read_text(path)
        if text is None:
            continue
        if CONFLICT_MARKERS_RE.search(text):
            print(str(path.relative_to(root)))
            failed = True
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
