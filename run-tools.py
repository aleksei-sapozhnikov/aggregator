"""Repository-local command runner.

This script is the single cross-platform entry point for small repository
tools. It keeps the repository root tidy while allowing actual tool
implementations to live under tools/.

Run without arguments to list available commands.
"""

from __future__ import annotations

import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class CommandSpec:
    """Describe one command exposed through the repository runner."""

    script: Path
    description: str
    examples: tuple[str, ...]


RUNNER = f"python {Path(__file__).name}"
REPO_ROOT = Path(__file__).resolve().parent

# Add new repository commands here. Each entry points to the script that owns
# the command behavior and provides short help text for the runner.
COMMANDS: dict[str, CommandSpec] = {
    "prune-squashed-branches": CommandSpec(
        script=Path("tools/prune-squashed-branches/main.py"),
        description="Find squashed local branches and offer to delete them.",
        examples=(f"{RUNNER} prune-squashed-branches",),
    ),
}


def show_usage() -> None:
    """Print the command list shown by global help flags."""
    print("Usage:")
    print(f"  {RUNNER} <command> [args]")
    print()
    print("Commands:")
    for name in sorted(COMMANDS):
        print(f"  {name}")
        print(f"    {COMMANDS[name].description}")


def show_command_help(name: str) -> None:
    """Print usage examples for one concrete command."""
    print("Usage:")
    for example in COMMANDS[name].examples:
        print(f"  {example}")


def main(argv: list[str]) -> int:
    """Run a named repository tool and return its process exit code."""
    if not argv or argv[0] in {"help", "-h", "--help"}:
        show_usage()
        return 0

    command = argv[0]
    tool_args = argv[1:]
    if command not in COMMANDS:
        print(f"error: unknown command: {command}", file=sys.stderr)
        show_usage()
        return 1

    if len(tool_args) == 1 and tool_args[0] in {"help", "-h", "--help"}:
        show_command_help(command)
        return 0

    script_path = REPO_ROOT / COMMANDS[command].script
    result = subprocess.run(
        [sys.executable, str(script_path), *tool_args],
        cwd=REPO_ROOT,
        check=False,
    )
    return result.returncode


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
