"""Run Go tests in the supplied project with workspace-local caches."""

from pathlib import Path

from code_qa.src.checks.tests.common import TestCommand, execute, parser
from code_qa.src.core.utils import dependency_environment, runtime_dir


def build_command(
    directory: Path, workspace: Path, packages: list[str], *, verbose: bool = False
) -> TestCommand:
    """Prepare one Go test invocation for explicit package patterns."""
    env = dependency_environment()
    env["GOMODCACHE"] = str(runtime_dir(workspace) / "go/modules")
    env["GOCACHE"] = str(runtime_dir(workspace) / "go/build")
    return TestCommand(
        ["go", "test", *(["-v"] if verbose else []), *packages], directory, env
    )


def main() -> int:
    """Run the requested test command."""
    cli = parser(__doc__)
    cli.add_argument("--packages", nargs="+", default=["./..."])
    args = cli.parse_args()
    return execute(
        build_command(
            args.directory.resolve(),
            args.workspace_root.resolve(),
            args.packages,
            verbose=args.verbose,
        )
    )


if __name__ == "__main__":
    raise SystemExit(main())
