"""Run offline Ansible syntax and lint checks without accessing AWS or EC2."""

from __future__ import annotations

import argparse
import subprocess
import sys
from pathlib import Path

from code_qa.src.core.inputs import read_path_manifest
from code_qa.src.core.utils import dependency_environment, runtime_dir
from code_qa.src.tools.ansible import ensure_ansible_python

ANSIBLE_SUFFIXES = {".yml", ".yaml", ".j2"}


def has_relevant_changes(
    directory: Path, changed_files: Path | None, workspace: Path
) -> bool:
    """Skip an unchanged playbook during file-scoped local hooks."""
    if changed_files is None:
        return True
    return any(
        path.is_relative_to(directory) and path.suffix.lower() in ANSIBLE_SUFFIXES
        for path in read_path_manifest(workspace, changed_files)
    )


def run(directory: Path, workspace: Path, changed_files: Path | None = None) -> int:
    """Validate and lint the whole Ansible playbook using pinned local tools."""
    if not has_relevant_changes(directory, changed_files, workspace):
        return 0
    if sys.platform == "win32":
        print("SKIPPED: Ansible QA requires Linux or WSL.")
        return 0
    python = ensure_ansible_python(workspace)
    if python is None:
        return 1

    environment = dependency_environment()
    cache = runtime_dir(workspace) / "ansible"
    for name in ("home", "tmp", "cache"):
        (cache / name).mkdir(parents=True, exist_ok=True)
    environment.update(
        {
            "ANSIBLE_HOME": str(cache / "home"),
            "ANSIBLE_LOCAL_TEMP": str(cache / "tmp"),
            "ANSIBLE_ROLES_PATH": str(directory / "roles"),
            "XDG_CACHE_HOME": str(cache / "cache"),
            "ANSIBLE_NOCOLOR": "1",
        }
    )

    commands = [
        [
            str(Path(python).parent / "ansible-playbook"),
            "-i",
            "localhost,",
            "--syntax-check",
            "site.yml",
        ],
        [
            str(Path(python).parent / "ansible-lint"),
            "--offline",
            "--profile=basic",
            "--nocolor",
            "site.yml",
        ],
    ]
    try:
        for command in commands:
            result = subprocess.run(
                command, cwd=directory, env=environment, check=False
            )
            if result.returncode:
                return result.returncode
    except OSError as error:
        print(f"Unable to run Ansible QA: {error}")
        return 1
    return 0


def main() -> int:
    """Validate a selected Ansible root from the code_qa orchestrator."""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--directory", required=True, type=Path)
    parser.add_argument("--workspace-root", required=True, type=Path)
    parser.add_argument("--changed-files-from", type=Path)
    parser.add_argument("--lint", required=True, action="store_true")
    args = parser.parse_args()
    return run(
        args.directory.resolve(),
        args.workspace_root.resolve(),
        args.changed_files_from,
    )


if __name__ == "__main__":
    raise SystemExit(main())
