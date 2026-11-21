"""Run pytest in the supplied project, preparing declared dependencies if needed."""

import subprocess
import sys
from pathlib import Path

from code_qa.src.checks.tests.common import TestCommand, execute, parser
from code_qa.src.tools.python import (
    ensure_venv,
    python_environment,
    python_has_module,
)


def resolve_python(
    directory: Path, workspace: Path, requirements: str | None, imports: list[str]
) -> str | None:
    """Use an available Python environment or install into the local QA virtualenv."""

    def available(python: str | Path) -> bool:
        return all(python_has_module(python, name) for name in imports)

    if available(sys.executable):
        return sys.executable
    python = ensure_venv(workspace)
    if python is None:
        print("Unable to create a local Python virtualenv for tests.", flush=True)
        return None
    if available(python):
        return str(python)
    command = [str(python), "-m", "pip", "install"]
    if requirements is not None:
        command.extend(["-r", str(directory / requirements)])
    command.append("pytest")
    try:
        result = subprocess.run(
            command, cwd=directory, env=python_environment(workspace), check=False
        )
    except OSError as error:
        print(f"Unable to install test dependencies: {error}", flush=True)
        return None
    if result.returncode != 0 or not available(python):
        print("Python test dependencies are unavailable.", flush=True)
        return None
    return str(python)


def build_command(
    directory: Path,
    workspace: Path,
    test_directory: str,
    requirements: str | None,
    imports: list[str],
    *,
    verbose: bool = False,
) -> TestCommand | None:
    """Prepare one pytest invocation for the supplied directory."""
    python = resolve_python(
        directory, workspace, requirements, list(dict.fromkeys(["pytest", *imports]))
    )
    if python is None:
        return None
    return TestCommand(
        [python, "-m", "pytest", "-v" if verbose else "-q", test_directory],
        directory,
        python_environment(workspace),
    )


def main() -> int:
    """Run the requested test command."""
    cli = parser(__doc__)
    cli.add_argument("--test-directory", required=True)
    cli.add_argument("--requirements")
    cli.add_argument("--require-import", action="append", default=[])
    args = cli.parse_args()
    return execute(
        build_command(
            args.directory.resolve(),
            args.workspace_root.resolve(),
            args.test_directory,
            args.requirements,
            args.require_import,
            verbose=args.verbose,
        )
    )


if __name__ == "__main__":
    raise SystemExit(main())
