"""Prepare an isolated, pinned Ansible toolchain for the demo playbook."""

from __future__ import annotations

import hashlib
import shutil
import subprocess
import sys
from pathlib import Path

from code_qa.src.core.utils import project_dir, runtime_dir
from code_qa.src.tools.python import python_environment, python_has_module


def ansible_venv(root: Path) -> Path:
    """Return the Ansible-only virtual environment under the QA runtime."""
    return runtime_dir(root) / "ansible" / "venv"


def ansible_python(root: Path) -> Path:
    """Return the platform-specific interpreter inside the Ansible environment."""
    executable = "Scripts/python.exe" if sys.platform == "win32" else "bin/python"
    return ansible_venv(root) / executable


def ensure_ansible_python(root: Path) -> str | None:
    """Install pinned Ansible tools once, refreshing when requirements change."""
    directory = ansible_venv(root)
    python = ansible_python(root)
    requirements = project_dir() / "requirements-ansible.txt"
    digest = hashlib.sha256(requirements.read_bytes()).hexdigest()
    marker = directory / "requirements.sha256"

    if (
        marker.is_file()
        and marker.read_text(encoding="utf-8").strip() == digest
        and python_has_module(python, "ansiblelint", root)
    ):
        return str(python)

    if not python.is_file() or not python_has_module(python, "pip", root):
        if directory.exists():
            shutil.rmtree(directory, ignore_errors=True)
        directory.parent.mkdir(parents=True, exist_ok=True)
        created = subprocess.run(
            [sys.executable, "-m", "venv", str(directory)],
            cwd=root,
            check=False,
            capture_output=True,
            text=True,
        )
        if created.returncode:
            print("Unable to create the local Ansible virtual environment.")
            return None

    try:
        installed = subprocess.run(
            [
                str(python),
                "-m",
                "pip",
                "install",
                "--requirement",
                str(requirements),
            ],
            cwd=root,
            env=python_environment(root),
            check=False,
            capture_output=True,
            text=True,
        )
    except OSError as error:
        print(f"Unable to install Ansible QA tools: {error}")
        return None
    if installed.returncode:
        for output in (installed.stdout, installed.stderr):
            if output:
                print(output.rstrip())
        return None
    if not python_has_module(python, "ansiblelint", root):
        print("Ansible-lint is unavailable after installation.")
        return None
    marker.write_text(digest + "\n", encoding="utf-8", newline="\n")
    return str(python)
