"""Shared CLI and subprocess handling for a single test command."""

from __future__ import annotations

import argparse
import subprocess
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class TestCommand:
    """Describe one test process without module selection or discovery."""

    command: list[str]
    directory: Path
    env: dict[str, str] | None = None


def parser(description: str) -> argparse.ArgumentParser:
    """Require the caller to supply working and cache directories."""
    result = argparse.ArgumentParser(description=description)
    result.add_argument("--directory", type=Path, required=True)
    result.add_argument("--workspace-root", type=Path, required=True)
    result.add_argument("--verbose", action="store_true")
    return result


def execute(command: TestCommand | None) -> int:
    """Execute exactly one prepared command; report setup or startup failures."""
    if command is None:
        return 1
    try:
        return subprocess.run(
            command.command,
            cwd=command.directory,
            env=command.env,
            check=False,
        ).returncode
    except OSError as error:
        print(f"Unable to start test command: {error}", flush=True)
        return 1
