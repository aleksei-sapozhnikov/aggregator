"""Run the typecheck script in one explicitly supplied TypeScript project."""

from __future__ import annotations

import argparse
import json
import subprocess
from pathlib import Path

from code_qa.src.core.inputs import read_path_manifest
from code_qa.src.tools.node import (
    ensure_dependencies,
    node_environment,
    platform_command,
)

TYPECHECK_TRIGGER_SUFFIXES = {
    ".cjs",
    ".cts",
    ".js",
    ".jsx",
    ".mjs",
    ".mts",
    ".ts",
    ".tsx",
}
TYPECHECK_TRIGGER_NAMES = {
    "package.json",
    "package-lock.json",
    "vite.config.js",
    "vite.config.mjs",
    "vite.config.ts",
}


def has_typecheck_script(package_json: Path) -> bool:
    """Return whether a package declares an npm typecheck script."""
    try:
        data = json.loads(package_json.read_text(encoding="utf-8"))
    except (OSError, UnicodeDecodeError, json.JSONDecodeError):
        return False
    scripts = data.get("scripts") if isinstance(data, dict) else None
    return isinstance(scripts, dict) and isinstance(scripts.get("typecheck"), str)


def is_typecheck_trigger(path: Path) -> bool:
    """Return whether this path can affect package type checking."""
    return (
        path.suffix.lower() in TYPECHECK_TRIGGER_SUFFIXES
        or path.name in TYPECHECK_TRIGGER_NAMES
        or (path.name.startswith("tsconfig") and path.suffix.lower() == ".json")
    )


def run(
    directory: Path,
    workspace: Path,
    changed_files: Path | None = None,
    script: str = "typecheck",
) -> int:
    """Install the local compiler if needed and check this package only."""
    if changed_files is not None:
        changed = read_path_manifest(workspace, changed_files)
        if not any(
            path.is_relative_to(directory) and is_typecheck_trigger(path)
            for path in changed
        ):
            return 0
    if not has_typecheck_script(directory / "package.json"):
        return 0
    if not ensure_dependencies(directory, workspace, "tsc"):
        return 1
    try:
        return subprocess.run(
            [platform_command("npm"), "run", script],
            cwd=directory,
            env=node_environment(workspace),
            check=False,
        ).returncode
    except OSError as error:
        print(f"Unable to start npm: {error}")
        return 1


def main() -> int:
    """Check one package without discovering other projects."""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--directory", type=Path, required=True)
    parser.add_argument("--workspace-root", type=Path, required=True)
    parser.add_argument("--changed-files-from", type=Path)
    parser.add_argument("--script", default="typecheck")
    args = parser.parse_args()
    return run(
        args.directory.resolve(),
        args.workspace_root.resolve(),
        args.changed_files_from,
        args.script,
    )


if __name__ == "__main__":
    raise SystemExit(main())
