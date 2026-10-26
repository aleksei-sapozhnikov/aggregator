"""Verify that package moves preserve imports and the public CLI entrypoint."""

from __future__ import annotations

import json
import runpy
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch

from code_qa.src.core import cli, utils


class PackageLayoutTests(unittest.TestCase):
    def test_check_modules_are_importable_from_a_different_working_directory(
        self,
    ) -> None:
        names = sorted(
            {check.runner for check in cli.CHECKS}
            | set(cli.TEST_EXECUTORS.values())
            | {
                "code_qa.src.checks.other.trufflehog",
                "code_qa.src.tools.infra_common",
                "code_qa.src.tools.node",
                "code_qa.src.tools.python",
                "code_qa.src.tools.tflint",
                "code_qa.src.tools.tofu",
                "code_qa.src.tools.jdk",
                "code_qa.src.tools.maven",
            }
        )
        source = (
            "import importlib,json,sys; "
            "[importlib.import_module(name) for name in json.loads(sys.argv[1])]; "
            "from code_qa.src.core.utils import project_dir,repo_root; "
            "print(json.dumps([str(project_dir()),str(repo_root())]))"
        )
        with tempfile.TemporaryDirectory() as directory:
            result = subprocess.run(
                [sys.executable, "-c", source, json.dumps(names)],
                cwd=directory,
                env=utils.dependency_environment(),
                capture_output=True,
                text=True,
                encoding="utf-8",
                check=False,
            )
        self.assertEqual(result.returncode, 0, result.stderr)
        project = Path(__file__).resolve().parents[1]
        self.assertEqual(
            json.loads(result.stdout), [str(project), str(project.parent.parent)]
        )

    def test_public_entrypoint_imports_the_cli_without_running_checks(self) -> None:
        entrypoint = Path(__file__).resolve().parents[1] / "src" / "main.py"
        namespace = runpy.run_path(str(entrypoint), run_name="entrypoint_import")
        run = MagicMock(return_value=0)
        with (
            patch.dict(namespace["main"].__globals__, {"run": run}),
            patch.object(sys, "path", list(sys.path)),
        ):
            self.assertEqual(namespace["main"](), 0)
        run.assert_called_once_with()


if __name__ == "__main__":
    unittest.main()
