"""Verify single-command execution without invoking external tools."""

import subprocess
import unittest
from contextlib import redirect_stdout
from io import StringIO
from pathlib import Path
from unittest.mock import patch

from code_qa.src.checks.tests import common


class CommandTests(unittest.TestCase):
    def test_preserves_directory_environment_and_status(self) -> None:
        command = common.TestCommand(
            ["custom-tool", "test"],
            Path("/relocated/project"),
            {"JAVA_HOME": "/qa-jdk"},
        )
        with patch.object(
            common.subprocess, "run", return_value=subprocess.CompletedProcess([], 2)
        ) as run:
            self.assertEqual(common.execute(command), 2)
        run.assert_called_once_with(
            command.command, cwd=command.directory, env=command.env, check=False
        )

    def test_failed_setup_does_not_start_a_command(self) -> None:
        with patch.object(common.subprocess, "run") as run:
            self.assertEqual(common.execute(None), 1)
        run.assert_not_called()

    def test_missing_executable_is_a_failure(self) -> None:
        with (
            patch.object(
                common.subprocess, "run", side_effect=FileNotFoundError("tool")
            ),
            redirect_stdout(StringIO()) as output,
        ):
            self.assertEqual(
                common.execute(common.TestCommand(["tool"], Path("/project"))), 1
            )
        self.assertIn("Unable to start test command: tool", output.getvalue())
