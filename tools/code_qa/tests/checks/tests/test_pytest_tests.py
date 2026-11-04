"""Verify pytest dependency setup without installing packages."""

import subprocess
import sys
import unittest
from contextlib import redirect_stdout
from io import StringIO
from pathlib import Path
from unittest.mock import patch

from code_qa.src.checks.tests import pytest_tests


class PytestTests(unittest.TestCase):
    def test_uses_selected_python_and_explicit_test_directory(self) -> None:
        directory, workspace = Path("/moved/python"), Path("/workspace")
        with patch.object(
            pytest_tests, "resolve_python", return_value="test-python"
        ) as resolve:
            command = pytest_tests.build_command(
                directory,
                workspace,
                "tests/unit",
                "requirements.txt",
                ["fastapi"],
                verbose=True,
            )
        self.assertEqual(
            command.command, ["test-python", "-m", "pytest", "-v", "tests/unit"]
        )
        self.assertEqual(command.directory, directory)
        resolve.assert_called_once_with(
            directory, workspace, "requirements.txt", ["pytest", "fastapi"]
        )

    def test_existing_python_does_not_install_packages(self) -> None:
        with (
            patch.object(pytest_tests, "python_has_module", return_value=True),
            patch.object(pytest_tests, "ensure_venv") as setup,
        ):
            self.assertEqual(
                pytest_tests.resolve_python(
                    Path("/project"), Path("/workspace"), None, ["pytest"]
                ),
                sys.executable,
            )
        setup.assert_not_called()

    def test_bootstrap_uses_supplied_requirements_path(self) -> None:
        directory, workspace = Path("/moved/python"), Path("/workspace")
        with (
            patch.object(
                pytest_tests, "python_has_module", side_effect=[False, False, True]
            ),
            patch.object(
                pytest_tests, "ensure_venv", return_value=Path("/venv/python")
            ) as setup,
            patch.object(
                pytest_tests.subprocess,
                "run",
                return_value=subprocess.CompletedProcess([], 0),
            ) as run,
        ):
            self.assertEqual(
                pytest_tests.resolve_python(
                    directory, workspace, "config/test-requirements.txt", ["pytest"]
                ),
                str(Path("/venv/python")),
            )
        setup.assert_called_once_with(workspace)
        self.assertEqual(
            run.call_args.args[0],
            [
                str(Path("/venv/python")),
                "-m",
                "pip",
                "install",
                "-r",
                str(directory / "config/test-requirements.txt"),
                "pytest",
            ],
        )
        self.assertEqual(run.call_args.kwargs["cwd"], directory)

    def test_install_failure_prevents_test_execution(self) -> None:
        with (
            patch.object(pytest_tests, "python_has_module", return_value=False),
            patch.object(
                pytest_tests, "ensure_venv", return_value=Path("/venv/python")
            ),
            patch.object(
                pytest_tests.subprocess,
                "run",
                return_value=subprocess.CompletedProcess([], 1),
            ),
            redirect_stdout(StringIO()),
        ):
            self.assertIsNone(
                pytest_tests.build_command(
                    Path("/project"), Path("/workspace"), "tests", None, []
                )
            )
