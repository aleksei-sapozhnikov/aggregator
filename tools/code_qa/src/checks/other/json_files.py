"""Validate JSON file syntax by parsing JSON documents."""

from __future__ import annotations

import json

from code_qa.src.core.inputs import parse_file_inputs


def main() -> int:
    """Validate syntax of repository JSON files."""
    failed = False
    inputs = parse_file_inputs()
    root = inputs.root
    for path in inputs.files:
        if path.suffix.lower() != ".json":
            continue
        try:
            json.loads(path.read_text(encoding="utf-8"))
        except (OSError, UnicodeDecodeError, json.JSONDecodeError) as exc:
            print(f"{path.relative_to(root)}: {exc}")
            failed = True
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
