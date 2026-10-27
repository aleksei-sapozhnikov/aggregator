"""Format or validate one OpenTofu root with isolated backend metadata."""

from __future__ import annotations

import argparse
import subprocess
import tempfile
from pathlib import Path

from code_qa.src.core.inputs import read_path_manifest
from code_qa.src.core.utils import dependency_environment, runtime_dir
from code_qa.src.tools.tofu import resolve

RELEVANT_SUFFIXES = {".tf", ".tfvars", ".hcl", ".json"}


def has_relevant_changes(
    directory: Path, changed_files: Path | None, workspace: Path
) -> bool:
    """Run whole-root checks when a Terraform source or config file changed."""
    if changed_files is None:
        return True
    return any(
        path.is_relative_to(directory) and path.suffix.lower() in RELEVANT_SUFFIXES
        for path in read_path_manifest(workspace, changed_files)
    )


def run(
    directory: Path,
    workspace: Path,
    mode: str,
    changed_files: Path | None = None,
) -> int:
    """Run formatting or validation with repository-local caches."""
    if not has_relevant_changes(directory, changed_files, workspace):
        return 0
    binary = resolve(workspace)
    if binary is None:
        return 1

    env = dependency_environment()
    env["TF_IN_AUTOMATION"] = "true"
    if mode == "validate":
        cache = runtime_dir(workspace) / "tofu" / "providers"
        cache.mkdir(parents=True, exist_ok=True)
        env["TF_PLUGIN_CACHE_DIR"] = str(cache)
        commands = [
            [
                binary,
                "init",
                "-backend=false",
                "-lockfile=readonly",
                "-input=false",
                "-no-color",
            ],
            [binary, "validate", "-no-color"],
        ]
    else:
        commands = [[binary, "fmt", "-recursive"]]
        if mode == "check":
            # -diff requires an external "diff" executable on Windows.
            # -check already fails when formatting changes are needed.
            commands[0].append("-check")

    runtime_dir(workspace).mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(
        prefix="tofu-data-", dir=runtime_dir(workspace)
    ) as data_dir:
        env["TF_DATA_DIR"] = data_dir
        try:
            for command in commands:
                result = subprocess.run(command, cwd=directory, env=env, check=False)
                if result.returncode:
                    return result.returncode
        except OSError as error:
            print(f"Unable to run OpenTofu: {error}")
            return 1
    return 0


def main() -> int:
    """Run one OpenTofu mode in an explicitly supplied directory."""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--directory", type=Path, required=True)
    parser.add_argument("--workspace-root", type=Path, required=True)
    parser.add_argument("--changed-files-from", type=Path)
    modes = parser.add_mutually_exclusive_group(required=True)
    modes.add_argument("--check-only", dest="mode", action="store_const", const="check")
    modes.add_argument("--format", dest="mode", action="store_const", const="format")
    modes.add_argument(
        "--validate", dest="mode", action="store_const", const="validate"
    )
    args = parser.parse_args()
    return run(
        args.directory.resolve(),
        args.workspace_root.resolve(),
        args.mode,
        args.changed_files_from,
    )


if __name__ == "__main__":
    raise SystemExit(main())
