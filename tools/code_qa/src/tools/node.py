"""Resolve npm and prepare locked, package-local Node dependencies."""

import subprocess
import sys
from pathlib import Path

from code_qa.src.core.utils import dependency_environment, repo_root, runtime_dir

PRETTIER_VERSION = "3.6.2"


def platform_command(name: str) -> str:
    """Resolve an npm shim without invoking a shell."""
    return f"{name}.cmd" if sys.platform == "win32" else name


def node_environment(root: Path | None = None) -> dict[str, str]:
    """Use the workspace-local npm cache."""
    return {
        **dependency_environment(),
        "npm_config_cache": str(runtime_dir(root) / "npm-cache"),
    }


def ensure_dependencies(directory: Path, workspace: Path, binary: str) -> bool:
    """Install from the lock file only when the requested local binary is absent."""
    executable = directory / "node_modules/.bin" / platform_command(binary)
    if executable.is_file():
        return True
    if not (directory / "package-lock.json").is_file():
        print(f"{directory}: missing package-lock.json for npm ci", flush=True)
        return False
    print(f"{directory}: installing dependencies with npm ci", flush=True)
    try:
        result = subprocess.run(
            [platform_command("npm"), "ci"],
            cwd=directory,
            env=node_environment(workspace),
            check=False,
        )
    except OSError as error:
        print(f"Unable to install npm dependencies: {error}", flush=True)
        return False
    return result.returncode == 0 and executable.is_file()


def prettier_bin_path(root: Path | None = None) -> Path:
    """Return the local Prettier executable path."""
    bin_dir = runtime_dir(root) / "node_modules" / ".bin"
    return bin_dir / ("prettier.cmd" if sys.platform == "win32" else "prettier")


def can_run_command(
    command: list[str], *, version: str | None = None, root: Path | None = None
) -> bool:
    """Check that a command is available and optionally matches a version."""
    try:
        result = subprocess.run(
            [*command, "--version"],
            cwd=root or repo_root(),
            check=False,
            capture_output=True,
            text=True,
        )
    except OSError:
        return False
    return result.returncode == 0 and (
        version is None or result.stdout.strip() == version
    )


def ensure_prettier_cmd(root: Path | None = None) -> list[str] | None:
    """Install and use the pinned Prettier inside the local Node runtime."""
    root = root or repo_root()
    local_prettier = prettier_bin_path(root)
    if local_prettier.exists() and can_run_command(
        [str(local_prettier)], version=PRETTIER_VERSION, root=root
    ):
        return [str(local_prettier)]
    npm = platform_command("npm")
    try:
        probe = subprocess.run(
            [npm, "--version"],
            cwd=root,
            check=False,
            capture_output=True,
            text=True,
        )
        if probe.returncode != 0:
            return None
        install = subprocess.run(
            [
                npm,
                "install",
                "--no-audit",
                "--no-fund",
                "--prefix",
                str(runtime_dir(root)),
                f"prettier@{PRETTIER_VERSION}",
            ],
            cwd=root,
            env=node_environment(root),
            check=False,
            capture_output=True,
            text=True,
        )
    except OSError:
        return None
    if (
        install.returncode == 0
        and local_prettier.exists()
        and can_run_command([str(local_prettier)], version=PRETTIER_VERSION, root=root)
    ):
        return [str(local_prettier)]
    return None
