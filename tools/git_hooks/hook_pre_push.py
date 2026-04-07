#!/usr/bin/env python3
"""Run pre-push QA flow."""

from __future__ import annotations

import os
import subprocess
import sys
import tempfile
from pathlib import Path

SCOPED_FILES_ENV = "CODE_QA_FILE_LIST"
ZERO_SHA = "0" * 40
EMPTY_TREE_SHA = "4b825dc642cb6eb9a060e54bf8d69288fbee4904"


def repo_root() -> Path:
    """Return repository root directory."""
    return Path(__file__).resolve().parent.parent.parent


def pushed_files() -> list[str] | None:
    """Collect changed files included in the current push update."""
    refs_input = sys.stdin.read()
    lines = [line.strip() for line in refs_input.splitlines() if line.strip()]
    if not lines:
        return []

    files: set[str] = set()
    for line in lines:
        parts = line.split()
        if len(parts) != 4:
            continue
        _, local_sha, _, remote_sha = parts
        if local_sha == ZERO_SHA:
            continue
        from_sha = remote_sha if remote_sha != ZERO_SHA else EMPTY_TREE_SHA
        result = subprocess.run(
            ["git", "diff", "--name-only", "--diff-filter=ACMR", f"{from_sha}..{local_sha}", "-z"],
            cwd=repo_root(),
            check=False,
            capture_output=True,
            text=False,
        )
        if result.returncode != 0:
            return None
        for raw in result.stdout.split(b"\x00"):
            if raw:
                files.add(raw.decode("utf-8", errors="surrogateescape").replace("\\", "/"))
    return sorted(files)


def main() -> int:
    """Run secrets scan for files included in push scope."""
    files = pushed_files()
    if files is None:
        print("error: failed to detect files being pushed.", file=sys.stderr)
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
    cmd = [
        sys.executable,
        "tools/code_qa/run_trufflehog.py",
        "--scan-root=.",
        "--summary",
        "--quiet",
    ]
    try:
        return subprocess.run(cmd, cwd=repo_root(), env=env, check=False).returncode
    finally:
        Path(scope_file).unlink(missing_ok=True)


if __name__ == "__main__":
    raise SystemExit(main())
