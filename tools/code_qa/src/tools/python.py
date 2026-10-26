"""Prepare the repository-local Python environment and pinned QA tools."""

from __future__ import annotations

import hashlib
import shutil
import subprocess
import sys
from pathlib import Path

from code_qa.src.core.utils import (
    dependency_environment,
    project_dir,
    repo_root,
    runtime_dir,
)


def python_environment(root: Path | None = None) -> dict[str, str]:
    """Use repository-local pip and Ruff caches for Python tool commands."""
    return {
        **dependency_environment(),
        "PIP_CACHE_DIR": str(runtime_dir(root) / "pip-cache"),
        "PIP_DISABLE_PIP_VERSION_CHECK": "1",
        "RUFF_CACHE_DIR": str(runtime_dir(root) / "ruff-cache"),
    }


def venv_dir(root: Path | None = None) -> Path:
    """Return the local QA virtualenv directory."""
    return runtime_dir(root) / "venv"


def venv_python(root: Path | None = None) -> Path:
    """Return the local QA Python executable."""
    if sys.platform == "win32":
        return venv_dir(root) / "Scripts" / "python.exe"
    return venv_dir(root) / "bin" / "python"


def python_has_module(
    python_exe: str | Path, module_name: str, root: Path | None = None
) -> bool:
    """Check whether a Python executable can import a module."""
    try:
        result = subprocess.run(
            [str(python_exe), "-c", f"import {module_name}"],
            cwd=root or repo_root(),
            check=False,
            capture_output=True,
            text=True,
        )
    except OSError:
        return False
    return result.returncode == 0


def ensure_venv(root: Path | None = None) -> Path | None:
    """Create the local virtualenv when it is missing or incomplete."""
    python = venv_python(root)
    if python.exists() and python_has_module(python, "pip", root):
        return python
    directory = venv_dir(root)
    if directory.exists():
        shutil.rmtree(directory, ignore_errors=True)
    directory.parent.mkdir(parents=True, exist_ok=True)
    result = subprocess.run(
        [sys.executable, "-m", "venv", str(directory)],
        cwd=root or repo_root(),
        check=False,
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        return None
    if python.exists() and python_has_module(python, "pip", root):
        return python
    return None


def ensure_python_with_module(module_name: str, root: Path | None = None) -> str | None:
    """Install the pinned QA requirements into the local virtualenv."""
    python = ensure_venv(root)
    if python is None:
        return None
    requirements = project_dir() / "requirements.txt"
    signature = hashlib.sha256(requirements.read_bytes()).hexdigest()
    marker = venv_dir(root) / "qa-requirements.sha256"
    installed = marker.read_text(encoding="utf-8").strip() if marker.is_file() else ""
    if installed == signature and python_has_module(python, module_name, root):
        return str(python)

    try:
        install = subprocess.run(
            [str(python), "-m", "pip", "install", "--requirement", str(requirements)],
            cwd=root or repo_root(),
            env=python_environment(root),
            check=False,
            capture_output=True,
            text=True,
        )
    except OSError as error:
        print(f"Unable to install local Python tools: {error}")
        return None
    if install.returncode != 0:
        for output in (install.stdout, install.stderr):
            if output:
                print(output.rstrip())
        return None
    if not python_has_module(python, module_name, root):
        return None
    marker.write_text(signature + "\n", encoding="utf-8", newline="\n")
    return str(python)
