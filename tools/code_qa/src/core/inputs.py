"""Read explicit file inputs supplied to a code check."""

from __future__ import annotations

import argparse
import json
from dataclasses import dataclass
from pathlib import Path

from code_qa.src.core.modules import MODULE_BY_NAME, MODULES


@dataclass(frozen=True)
class FileInputs:
    """Keep diagnostic paths relative to a root and inspect only listed files."""

    root: Path
    files: list[Path]


def files_in_module(root: Path, module_name: str, paths: list[Path]) -> list[Path]:
    """Keep files under the configured module path, excluding nested modules."""
    root = root.resolve()
    module = MODULE_BY_NAME[module_name]
    directory = (root / module.path).resolve()
    nested_directories = [
        (root / child.path).resolve()
        for child in MODULES
        if child.name != module_name
        and (root / child.path).resolve().is_relative_to(directory)
    ]
    result = []
    for path in paths:
        resolved = path.resolve()
        if not resolved.is_relative_to(directory):
            continue
        if any(resolved.is_relative_to(nested) for nested in nested_directories):
            continue
        result.append(resolved)
    return result


def read_path_manifest(root: Path, manifest: Path) -> list[Path]:
    """Read every path in a manifest, including deleted files for scope checks."""
    paths = json.loads(manifest.read_text(encoding="utf-8"))
    if not isinstance(paths, list) or any(not isinstance(path, str) for path in paths):
        raise ValueError("File manifest must contain an array of paths.")
    resolved_root = root.resolve()
    result = [(resolved_root / path).resolve() for path in paths]
    if any(not path.is_relative_to(resolved_root) for path in result):
        raise ValueError("File manifest contains a path outside the supplied root.")
    return result


def add_file_arguments(parser: argparse.ArgumentParser) -> None:
    """Use a manifest to avoid command-line length limits on Windows."""
    parser.add_argument("--root", type=Path, required=True)
    parser.add_argument("--files-from", type=Path, required=True)


def file_inputs(args: argparse.Namespace) -> FileInputs:
    """Read a JSON array of paths relative to the explicit root."""
    root = args.root.resolve()
    paths = read_path_manifest(root, args.files_from)
    return FileInputs(root, [path for path in paths if path.is_file()])


def parse_file_inputs() -> FileInputs:
    """Parse the common CLI for checks without additional options."""
    parser = argparse.ArgumentParser()
    add_file_arguments(parser)
    return file_inputs(parser.parse_args())
