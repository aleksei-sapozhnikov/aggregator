#!/usr/bin/env python3
"""Validate YAML file syntax by parsing YAML documents."""

from __future__ import annotations

import os
import subprocess
import sys
from importlib import import_module
from pathlib import Path

from utils import ensure_python_with_module, iter_repo_files, repo_root


def main() -> int:
    """Validate syntax of repository YAML files."""
    try:
        import yaml  # type: ignore
    except Exception:
        python_with_yaml = ensure_python_with_module("yaml", "pyyaml")
        if not python_with_yaml:
            print("PyYAML is not installed and local venv bootstrap failed.")
            return 1
        current_python = str(Path(sys.executable).resolve())
        if current_python == str(Path(python_with_yaml).resolve()):
            try:
                yaml = import_module("yaml")  # type: ignore
            except Exception:
                print("PyYAML is not installed and import failed after bootstrap.")
                return 1
        else:
            env = os.environ.copy()
            env["CODE_QA_YAML_BOOTSTRAPPED"] = "1"
            return subprocess.run(
                [python_with_yaml, str(Path(__file__).resolve())],
                cwd=repo_root(),
                env=env,
                check=False,
            ).returncode

    failed = False
    root = repo_root()
    for path in iter_repo_files():
        if path.suffix.lower() not in {".yaml", ".yml"}:
            continue
        try:
            yaml.safe_load(path.read_text(encoding="utf-8"))
        except Exception as exc:
            print(f"{path.relative_to(root)}: {exc}")
            failed = True
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
