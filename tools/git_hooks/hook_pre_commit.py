#!/usr/bin/env python3
"""Run pre-commit QA flow according to local git hook mode."""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path


def repo_root() -> Path:
    return Path(__file__).resolve().parent.parent.parent


def read_hook_mode() -> str | None:
    result = subprocess.run(
        ["git", "config", "--local", "--get", "hooks.qaMode"],
        cwd=repo_root(),
        check=False,
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        return None
    value = (result.stdout or "").strip()
    return value or None


def main() -> int:
    mode = read_hook_mode()
    if mode is None:
        print(
            "error: hooks.qaMode is not configured. Run tools/git_hooks/setup_git_hooks.py --mode ...",
            file=sys.stderr,
        )
        return 1

    if mode == "lint-only":
        cmd = [sys.executable, "tools/git_hooks/run_format_check_only.py"]
    elif mode == "format-and-lint":
        cmd = [sys.executable, "tools/git_hooks/run_format_and_check.py"]
    else:
        print(f"error: unsupported hooks.qaMode value: {mode}", file=sys.stderr)
        return 1

    return subprocess.run(cmd, cwd=repo_root(), check=False).returncode


if __name__ == "__main__":
    raise SystemExit(main())
