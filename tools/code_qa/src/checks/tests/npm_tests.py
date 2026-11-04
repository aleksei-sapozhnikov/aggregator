"""Run an npm test script in the supplied package."""

import argparse
from pathlib import Path

from code_qa.src.checks.tests.common import TestCommand, execute, parser
from code_qa.src.tools.node import (
    ensure_dependencies,
    node_environment,
    platform_command,
)


def build_command(
    directory: Path, workspace: Path, script: str, binary: str, arguments: list[str]
) -> TestCommand | None:
    """Prepare one npm invocation and plain-text output."""
    if not ensure_dependencies(directory, workspace, binary):
        return None
    env = node_environment(workspace)
    env["NO_COLOR"] = "1"
    env.pop("FORCE_COLOR", None)
    arguments = arguments[1:] if arguments[:1] == ["--"] else arguments
    command = [
        platform_command("npm"),
        "run",
        script,
        *(["--", *arguments] if arguments else []),
    ]
    return TestCommand(command, directory, env)


def main() -> int:
    """Run the requested test command."""
    cli = parser(__doc__)
    cli.add_argument("--script", default="test")
    cli.add_argument("--binary", required=True)
    cli.add_argument("arguments", nargs=argparse.REMAINDER)
    args = cli.parse_args()
    return execute(
        build_command(
            args.directory.resolve(),
            args.workspace_root.resolve(),
            args.script,
            args.binary,
            args.arguments,
        )
    )


if __name__ == "__main__":
    raise SystemExit(main())
