"""Check and apply formatting for Prettier-supported files."""

from __future__ import annotations

import argparse
import subprocess
import sys
from collections.abc import Iterator
from typing import TextIO

from utils import ensure_prettier_cmd, iter_repo_files, repo_root

# Stay below Windows cmd.exe's 8191-character command-line limit.
# Leave room for the command shim, quoting, and other shell overhead.
MAX_COMMAND_LENGTH = 4_000

# The top-level QA runner already prints check and format statuses.
PRETTIER_STATUS_LINES = {
    "Checking formatting...",
    "Formatting...",
    "All matched files use Prettier code style!",
}

PRETTIER_SUFFIXES = {
    ".js",
    ".mjs",
    ".cjs",
    ".ts",
    ".mts",
    ".cts",
    ".jsx",
    ".tsx",
    ".json",
    ".yaml",
    ".yml",
    ".md",
    ".css",
    ".html",
}


def build_parser() -> argparse.ArgumentParser:
    """Create CLI parser for Prettier modes."""
    parser = argparse.ArgumentParser(
        description="Run prettier in check-only or format mode."
    )
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--check-only", action="store_true")
    group.add_argument("--format", action="store_true")
    return parser


def batched_file_args(command: list[str], files: list[str]) -> Iterator[list[str]]:
    """Split files into argument batches that fit Windows command-line limits."""
    # Account conservatively for argument separation and quotes.
    base_length = sum(len(arg) + 3 for arg in command)
    if base_length >= MAX_COMMAND_LENGTH:
        raise ValueError("Prettier command itself exceeds the safe argument limit.")

    batch: list[str] = []
    current_length = base_length
    for file in files:
        arg_length = len(file) + 3
        if current_length + arg_length > MAX_COMMAND_LENGTH and batch:
            yield batch
            batch = []
            current_length = base_length
        if current_length + arg_length > MAX_COMMAND_LENGTH:
            raise ValueError(f"File path is too long for Prettier: {file}")
        batch.append(file)
        current_length += arg_length
    if batch:
        yield batch


def print_prettier_output(output: str | None, stream: TextIO) -> None:
    """Forward useful Prettier output without repeated per-batch banners."""
    for line in (output or "").splitlines():
        stripped = line.strip()
        if stripped not in PRETTIER_STATUS_LINES and not stripped.endswith(
            " (unchanged)"
        ):
            print(line, file=stream)


def run_prettier(command: list[str], files: list[str]) -> int:
    """Process every file and report failure if any Prettier batch fails."""
    return_code = 0
    for batch in batched_file_args(command, files):
        result = subprocess.run(
            [*command, *batch],
            cwd=repo_root(),
            check=False,
            capture_output=True,
            text=True,
        )
        print_prettier_output(result.stdout, sys.stdout)
        print_prettier_output(result.stderr, sys.stderr)
        if result.returncode != 0:
            return_code = result.returncode
    return return_code


def main() -> int:
    """Run Prettier check or write mode for supported files."""
    args = build_parser().parse_args()
    prettier_cmd = ensure_prettier_cmd()
    if prettier_cmd is None:
        print("prettier is not installed and local install failed (npm unavailable?).")
        return 1
    root = repo_root()
    files = [
        str(path.relative_to(root))
        for path in iter_repo_files()
        if path.suffix.lower() in PRETTIER_SUFFIXES
    ]
    if not files:
        return 0
    action = "--check" if args.check_only else "--write"
    return run_prettier([*prettier_cmd, action], files)


if __name__ == "__main__":
    raise SystemExit(main())
