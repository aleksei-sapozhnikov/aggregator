"""Verify npm script parameters and plain-text output."""

import os
import unittest
from pathlib import Path
from unittest.mock import patch

from code_qa.src.checks.tests import npm_tests


class NpmTests(unittest.TestCase):
    def test_uses_requested_script_and_arguments(self) -> None:
        directory, workspace = Path("/moved/ui"), Path("/workspace")
        with (
            patch.object(npm_tests, "ensure_dependencies", return_value=True) as setup,
            patch.dict(os.environ, {"FORCE_COLOR": "3"}),
        ):
            command = npm_tests.build_command(
                directory,
                workspace,
                "test:unit",
                "vitest",
                ["--", "--reporter=dot", "--no-color"],
            )
        self.assertEqual(
            command.command,
            [
                npm_tests.platform_command("npm"),
                "run",
                "test:unit",
                "--",
                "--reporter=dot",
                "--no-color",
            ],
        )
        self.assertEqual(command.directory, directory)
        self.assertEqual(command.env["NO_COLOR"], "1")
        self.assertNotIn("FORCE_COLOR", command.env)
        setup.assert_called_once_with(directory, workspace, "vitest")

    def test_dependency_failure_stops_setup(self) -> None:
        with patch.object(npm_tests, "ensure_dependencies", return_value=False):
            self.assertIsNone(
                npm_tests.build_command(
                    Path("/project"), Path("/workspace"), "test", "vitest", []
                )
            )
