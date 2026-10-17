"""Run unit tests for each supported module with a readable per-module summary."""

from __future__ import annotations

import argparse
import subprocess
import sys
from dataclasses import dataclass

from run_jdk import resolve_java_home
from pathlib import Path

from run_maven import maven_environment, resolve_maven_command
from utils import (
    ensure_venv,
    python_has_module,
    repo_root,
)

MODULE_NAMES = ("aggregator", "aggregator-ui", "catalog", "ai-agent", "code-qa")
PYTHON_TEST_IMPORTS = ("pytest", "fastapi", "httpx", "boto3", "lingua", "requests")


@dataclass(frozen=True)
class TestModule:
    """Describe one module's test runner and its working directory."""

    name: str
    directory: Path
    command: list[str]
    env: dict[str, str] | None = None


def platform_command(name: str) -> str:
    """Resolve npm and Maven on Windows without relying on shell=True."""
    return f"{name}.cmd" if sys.platform == "win32" and name in {"npm", "mvn"} else name


def python_test_dependencies_available(python: str | Path) -> bool:
    """Check whether the selected Python can import required test packages."""
    return all(python_has_module(python, module) for module in PYTHON_TEST_IMPORTS)


def resolve_ai_agent_python(root: Path) -> str | None:
    """Use an existing test environment or prepare the shared QA virtualenv."""
    if python_test_dependencies_available(sys.executable):
        return sys.executable

    python = ensure_venv()
    if python is None:
        print("Unable to create a Python virtualenv for ai-agent tests.", flush=True)
        return None

    if not python_test_dependencies_available(python):
        requirements = root / "services-core" / "ai-agent" / "src" / "requirements.txt"
        print(
            "Installing ai-agent test dependencies into the QA virtualenv...",
            flush=True,
        )
        try:
            result = subprocess.run(
                [
                    str(python),
                    "-m",
                    "pip",
                    "install",
                    "-r",
                    str(requirements),
                    "pytest",
                ],
                cwd=root,
                check=False,
            )
        except OSError as error:
            print(f"Unable to install ai-agent test dependencies: {error}", flush=True)
            return None
        if result.returncode != 0 or not python_test_dependencies_available(python):
            print("ai-agent test dependencies are unavailable.", flush=True)
            return None

    return str(python)


def ensure_ui_test_dependencies(directory: Path) -> bool:
    """Install locked npm dependencies if the Vitest executable is absent."""
    vitest = (
        directory
        / "node_modules"
        / ".bin"
        / ("vitest.cmd" if sys.platform == "win32" else "vitest")
    )
    if vitest.exists():
        return True

    if not (directory / "package-lock.json").exists():
        print("Missing package-lock.json for aggregator-ui npm ci.", flush=True)
        return False

    print("Installing aggregator-ui test dependencies with npm ci...", flush=True)
    try:
        result = subprocess.run(
            [platform_command("npm"), "ci"],
            cwd=directory,
            check=False,
        )
    except OSError as error:
        print(f"Unable to install aggregator-ui test dependencies: {error}", flush=True)
        return False
    return result.returncode == 0 and vitest.exists()


def build_module(root: Path, name: str) -> TestModule | None:
    """Build a module command; return None if prerequisites cannot be prepared."""
    if name == "code-qa":
        return TestModule(
            name,
            root,
            [
                sys.executable,
                "-m",
                "unittest",
                "discover",
                "-s",
                "tools/code_qa",
                "-p",
                "test_*.py",
                "-v",
            ],
        )

    directory = root / "services-core" / name
    environment = None
    if name == "aggregator":
        java_home = resolve_java_home(root)
        if java_home is None:
            return None
        maven = resolve_maven_command(root)
        if maven is None:
            return None
        command = [maven, "-B", "test"]
        environment = maven_environment(java_home)
    elif name == "aggregator-ui":
        if not ensure_ui_test_dependencies(directory):
            return None
        command = [platform_command("npm"), "test", "--", "--reporter=verbose"]
    elif name == "catalog":
        command = ["go", "test", "-v", "./..."]
    elif name == "ai-agent":
        python = resolve_ai_agent_python(root)
        if python is None:
            return None
        command = [python, "-m", "pytest", "-v", "tests"]
    else:
        raise ValueError(f"Unknown test module: {name}")

    return TestModule(name, directory, command, environment)


def execute_module(module: TestModule) -> int:
    """Stream full unit-test results and preserve the underlying exit code."""
    print(f"  command: {' '.join(module.command)}", flush=True)
    try:
        result = subprocess.run(
            module.command,
            cwd=module.directory,
            check=False,
            **({"env": module.env} if module.env is not None else {}),
        )
    except OSError as error:
        print(f"  Could not start {module.name} tests: {error}", flush=True)
        return 1
    return result.returncode


def run_modules(names: list[str], root: Path | None = None) -> int:
    """Run every selected module even if an earlier test suite fails."""
    root = root or repo_root()
    failures: list[str] = []
    for name in names:
        print(f"\nTesting {name}...", flush=True)
        directory = root if name == "code-qa" else root / "services-core" / name
        if not directory.is_dir():
            print(f"  Missing module directory: {directory}", flush=True)
            failures.append(name)
            continue

        module = build_module(root, name)
        if module is None:
            print(f"Testing {name}.. FAILED (setup)", flush=True)
            failures.append(name)
            continue

        status = execute_module(module)
        print(f"Testing {name}.. {'OK' if status == 0 else 'FAILED'}", flush=True)
        if status != 0:
            failures.append(name)

    print(f"\n=== TESTS: {'FAILED' if failures else 'PASSED'} ===", flush=True)
    if failures:
        print(f"Failed modules: {', '.join(failures)}", flush=True)
    return 1 if failures else 0


def build_parser() -> argparse.ArgumentParser:
    """Parse module selections; without --module, run the entire test matrix."""
    parser = argparse.ArgumentParser(description="Run module unit tests.")
    parser.add_argument(
        "--module",
        action="append",
        choices=MODULE_NAMES,
        help="Run only a selected module (may be repeated).",
    )
    return parser


def main() -> int:
    """Run the selected module suites."""
    args = build_parser().parse_args()
    return run_modules(list(dict.fromkeys(args.module or MODULE_NAMES)))


if __name__ == "__main__":
    raise SystemExit(main())
