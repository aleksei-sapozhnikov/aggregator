"""Run Maven tests in the supplied Java project."""

from pathlib import Path

from code_qa.src.checks.tests.common import TestCommand, execute, parser
from code_qa.src.tools.jdk import resolve_java_home
from code_qa.src.tools.maven import maven_environment, resolve_maven_command


def build_command(
    directory: Path, workspace: Path, *, verbose: bool = False
) -> TestCommand | None:
    """Prepare Java and Maven, keeping downloaded artifacts in the workspace."""
    java_home = resolve_java_home(workspace)
    if java_home is None:
        return None
    maven = resolve_maven_command(workspace)
    if maven is None:
        return None
    command = [
        maven,
        *([] if verbose else ["-q"]),
        "-B",
        f"-Dmaven.repo.local={workspace / '.temp/qa-runtime/maven-repository'}",
        "test",
    ]
    return TestCommand(command, directory, maven_environment(java_home))


def main() -> int:
    """Run the requested test command."""
    args = parser(__doc__).parse_args()
    return execute(
        build_command(
            args.directory.resolve(),
            args.workspace_root.resolve(),
            verbose=args.verbose,
        )
    )


if __name__ == "__main__":
    raise SystemExit(main())
