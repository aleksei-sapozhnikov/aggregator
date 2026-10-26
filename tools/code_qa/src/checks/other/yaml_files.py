"""Validate YAML file syntax by parsing YAML documents."""

from __future__ import annotations

import os
import subprocess
import sys

from code_qa.src.core.inputs import parse_file_inputs
from code_qa.src.core.utils import dependency_environment
from code_qa.src.tools.python import ensure_python_with_module

BOOTSTRAP_ENV = "CODE_QA_YAML_BOOTSTRAPPED"


def main() -> int:
    """Validate syntax of repository YAML files."""
    inputs = parse_file_inputs()
    if os.environ.get(BOOTSTRAP_ENV) != "1":
        python_with_yaml = ensure_python_with_module("yaml")
        if not python_with_yaml:
            print("PyYAML is not installed and local venv bootstrap failed.")
            return 1
        env = dependency_environment()
        env[BOOTSTRAP_ENV] = "1"
        return subprocess.run(
            [
                python_with_yaml,
                "-m",
                "code_qa.src.checks.other.yaml_files",
                *sys.argv[1:],
            ],
            cwd=inputs.root,
            env=env,
            check=False,
        ).returncode

    try:
        import yaml
    except ImportError:
        print("PyYAML import failed in the local QA virtualenv.")
        return 1

    failed = False
    root = inputs.root
    for path in inputs.files:
        if path.suffix.lower() not in {".yaml", ".yml"}:
            continue
        try:
            yaml.safe_load(path.read_text(encoding="utf-8"))
        except (OSError, UnicodeDecodeError, yaml.YAMLError) as exc:
            print(f"{path.relative_to(root)}: {exc}")
            failed = True
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
