#!/usr/bin/env python3
"""Hook flow: run code checks only (no formatting, no secrets scan)."""

from __future__ import annotations

import os
import subprocess
import sys
import tempfile
from pathlib import Path

SCOPED_FILES_ENV = "CODE_QA_FILE_LIST"


def repo_root() -> Path:
    return Path(__file__).resolve().parent.parent.parent


def staged_files() -> list[str] | None:
    result = subprocess.run(
        ["git", "diff", "--cached", "--name-only", "--diff-filter=ACMR", "-z"],
        cwd=repo_root(),
        check=False,
        capture_output=True,
        text=False,
    )
    if result.returncode != 0:
        return None
    files: list[str] = []
    for raw in result.stdout.split(b"\x00"):
        if not raw:
            continue
        files.append(raw.decode("utf-8", errors="surrogateescape").replace("\\", "/"))
    return files


def main() -> int:
    files = staged_files()
    if files is None:
        print("error: failed to read staged files.", file=sys.stderr)
        return 1
    if not files:
        return 0

    with tempfile.NamedTemporaryFile(
        mode="w", encoding="utf-8", delete=False, suffix=".txt"
    ) as tmp:
        for path in files:
            tmp.write(path + "\n")
        scope_file = tmp.name

    env = os.environ.copy()
    env[SCOPED_FILES_ENV] = scope_file
    cmd = [sys.executable, "tools/code_qa/main.py", "format-check-only"]
    try:
        result = subprocess.run(cmd, cwd=repo_root(), env=env, check=False)
        return result.returncode
    finally:
        Path(scope_file).unlink(missing_ok=True)


if __name__ == "__main__":
    raise SystemExit(main())
