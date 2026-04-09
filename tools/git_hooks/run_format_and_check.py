#!/usr/bin/env python3
"""Hook flow: run code format flow and fail when files were changed."""

from __future__ import annotations

import os
import subprocess
import sys
import tempfile
from pathlib import Path

SCOPED_FILES_ENV = "CODE_QA_FILE_LIST"


def repo_root() -> Path:
    """Return repository root directory."""
    return Path(__file__).resolve().parent.parent.parent


def capture_git_status() -> str:
    """Capture repository status for change detection."""
    result = subprocess.run(
        ["git", "status", "--porcelain"],
        cwd=repo_root(),
        check=False,
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        print(result.stderr.strip() or "error: failed to read git status", file=sys.stderr)
        return "__GIT_STATUS_ERROR__"
    return (result.stdout or "").strip()


def staged_files() -> list[str] | None:
    """Return staged file paths for the current commit."""
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
    """Run scoped format flow and fail when it modifies tracked state."""
    files = staged_files()
    if files is None:
        print("error: failed to read staged files.", file=sys.stderr)
        return 1
    if not files:
        return 0

    before = capture_git_status()
    if before == "__GIT_STATUS_ERROR__":
        return 1

    with tempfile.NamedTemporaryFile(
        mode="w", encoding="utf-8", delete=False, suffix=".txt"
    ) as tmp:
        for path in files:
            tmp.write(path + "\n")
        scope_file = tmp.name

    env = os.environ.copy()
    env[SCOPED_FILES_ENV] = scope_file
    try:
        result = subprocess.run(
            [sys.executable, "tools/code_qa/main.py", "format"],
            cwd=repo_root(),
            env=env,
            check=False,
        )
        if result.returncode != 0:
            return result.returncode

        after = capture_git_status()
        if after == "__GIT_STATUS_ERROR__":
            return 1
        if before != after:
            print("Hook changed repository files. Review and stage updates, then commit again.")
            return 1
        return 0
    finally:
        Path(scope_file).unlink(missing_ok=True)


if __name__ == "__main__":
    raise SystemExit(main())
