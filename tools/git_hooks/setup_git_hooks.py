#!/usr/bin/env python3
"""Install local git hooks with explicit QA mode."""

from __future__ import annotations

import argparse
import shutil
import subprocess
import sys
import sysconfig
from pathlib import Path


def repo_root() -> Path:
    """Return repository root directory based on this script location."""
    return Path(__file__).resolve().parent.parent.parent


def build_parser() -> argparse.ArgumentParser:
    """Build CLI parser for git hook setup command."""
    parser = argparse.ArgumentParser(
        description="Install git hooks with selected QA behavior.",
        epilog=(
            "Examples:\n"
            "  python tools/git_hooks/setup_git_hooks.py --mode lint-only\n"
            "  python tools/git_hooks/setup_git_hooks.py --mode format-and-lint\n\n"
            "Modes:\n"
            "  lint-only: hook runs checks without editing code.\n"
            "  format-and-lint: hook can format files and then validates results."
        ),
        formatter_class=argparse.RawTextHelpFormatter,
    )
    parser.add_argument(
        "--mode",
        required=True,
        choices=["lint-only", "format-and-lint"],
        help="Hook behavior to install.",
    )
    return parser


def resolve_prek() -> str:
    """Resolve prek executable path or exit with a readable error."""
    found = shutil.which("prek")
    if found:
        return found

    scripts_dir = Path(sysconfig.get_path("scripts"))
    for candidate in (scripts_dir / "prek", scripts_dir / "prek.exe"):
        if candidate.exists():
            return str(candidate)

    print(
        "error: prek executable not found. Install it first using tools/git_hooks/setup_prek.py.",
        file=sys.stderr,
    )
    raise SystemExit(1)


def install_hook(prek: str, hook_type: str, config_path: Path) -> int:
    """Install given hook type via prek with explicit config."""
    if not config_path.exists():
        print(f"error: missing prek config: {config_path}", file=sys.stderr)
        return 1
    result = subprocess.run(
        [
            prek,
            "install",
            "-f",
            "--hook-type",
            hook_type,
            "-c",
            str(config_path),
        ],
        cwd=repo_root(),
        check=False,
    )
    return result.returncode


def set_hook_mode(mode: str) -> int:
    """Persist selected pre-commit mode in local git config."""
    result = subprocess.run(
        ["git", "config", "--local", "hooks.qaMode", mode],
        cwd=repo_root(),
        check=False,
    )
    return result.returncode


def main() -> int:
    """Install pre-commit and pre-push hooks."""
    args = build_parser().parse_args()
    prek = resolve_prek()
    config_path = repo_root() / "prek.toml"

    pre_commit_rc = install_hook(prek, "pre-commit", config_path)
    if pre_commit_rc != 0:
        return pre_commit_rc

    pre_push_rc = install_hook(prek, "pre-push", config_path)
    if pre_push_rc != 0:
        return pre_push_rc

    mode_rc = set_hook_mode(args.mode)
    if mode_rc != 0:
        return mode_rc

    print(f"Installed git hooks mode: {args.mode}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
