"""Detect files that exceed the configured repository size limit."""

from __future__ import annotations

from code_qa.src.core.inputs import parse_file_inputs

LARGE_FILE_LIMIT_BYTES = 500 * 1024


def main() -> int:
    """Check tracked files against the configured size limit."""
    failed = False
    inputs = parse_file_inputs()
    root = inputs.root
    for path in inputs.files:
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
