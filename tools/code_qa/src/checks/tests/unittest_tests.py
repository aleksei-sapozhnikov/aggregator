"""Run unittest discovery with explicit start and import directories."""

import sys
from pathlib import Path

from code_qa.src.checks.tests.common import TestCommand, execute, parser


def build_command(
    directory: Path,
    start: str,
    top_level: str | None = None,
    pattern: str = "test_*.py",
    *,
    verbose: bool = False,
) -> TestCommand:
    """Prepare a standard-library test command without dependency setup."""
    command = [sys.executable, "-m", "unittest", "discover", "-s", start, "-p", pattern]
    if top_level is not None:
        command.extend(["-t", top_level])
    if verbose:
        command.append("-v")
    return TestCommand(command, directory)


def main() -> int:
    """Run the requested test command."""
    cli = parser(__doc__)
    cli.add_argument("--start-directory", required=True)
    cli.add_argument("--top-level-directory")
    cli.add_argument("--pattern", default="test_*.py")
    args = cli.parse_args()
    return execute(
        build_command(
            args.directory.resolve(),
            args.start_directory,
            args.top_level_directory,
            args.pattern,
            verbose=args.verbose,
        )
    )


if __name__ == "__main__":
    raise SystemExit(main())
