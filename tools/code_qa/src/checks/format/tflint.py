"""Lint one configured infrastructure root with its local TFLint policy."""

from __future__ import annotations

import argparse
import subprocess
import tempfile
from pathlib import Path

from code_qa.src.core.inputs import read_path_manifest
from code_qa.src.core.utils import dependency_environment, runtime_dir
from code_qa.src.tools.tflint import resolve

RELEVANT_SUFFIXES = {".tf", ".tfvars", ".hcl", ".json"}


def has_relevant_changes(
    directory: Path, changed_files: Path | None, workspace: Path
) -> bool:
    """Run lint when a Terraform source or config file changed."""
    if changed_files is None:
        return True
    return any(
        path.is_relative_to(directory) and path.suffix.lower() in RELEVANT_SUFFIXES
        for path in read_path_manifest(workspace, changed_files)
    )


def run(directory: Path, workspace: Path, changed_files: Path | None = None) -> int:
    """Initialize plugins and lint the supplied root with notice-level failures."""
    if not has_relevant_changes(directory, changed_files, workspace):
        return 0
    binary = resolve(workspace)
    if binary is None:
        return 1

    config = directory / ".tflint.hcl"
    env = dependency_environment()
    env["TF_IN_AUTOMATION"] = "true"
    env["TFLINT_DISABLE_VERSION_CHECK"] = "1"
    cache = runtime_dir(workspace) / "tflint" / "plugins"
    cache.mkdir(parents=True, exist_ok=True)
    env["TFLINT_PLUGIN_DIR"] = str(cache)
    commands = [
        [binary, "--init", f"--config={config}"],
        [
            binary,
            "--recursive",
            f"--config={config}",
            "--format=compact",
            "--minimum-failure-severity=notice",
            "--no-color",
        ],
    ]
    runtime_dir(workspace).mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(
        prefix="tflint-data-", dir=runtime_dir(workspace)
    ) as data_dir:
        env["TF_DATA_DIR"] = data_dir
        try:
            for command in commands:
                result = subprocess.run(command, cwd=directory, env=env, check=False)
                if result.returncode:
                    return result.returncode
        except OSError as error:
            print(f"Unable to run TFLint: {error}")
            return 1
    return 0


def main() -> int:
    """Lint one explicitly supplied infrastructure root."""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--directory", type=Path, required=True)
    parser.add_argument("--workspace-root", type=Path, required=True)
    parser.add_argument("--changed-files-from", type=Path)
    parser.add_argument("--lint", action="store_true", required=True)
    args = parser.parse_args()
    return run(
        args.directory.resolve(),
        args.workspace_root.resolve(),
        args.changed_files_from,
    )


if __name__ == "__main__":
    raise SystemExit(main())
