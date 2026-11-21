"""Verify standard-library discovery with explicit project-relative paths."""

import sys
import unittest
from pathlib import Path

from code_qa.src.checks.tests import unittest_tests


class UnittestTests(unittest.TestCase):
    def test_start_and_import_directories_are_caller_parameters(self) -> None:
        directory = Path("/moved/python")
        command = unittest_tests.build_command(directory, "tests", "..", verbose=True)
        self.assertEqual(command.directory, directory)
        self.assertEqual(
            command.command,
            [
                sys.executable,
                "-m",
                "unittest",
                "discover",
                "-s",
                "tests",
                "-p",
                "test_*.py",
                "-t",
                "..",
                "-v",
            ],
        )

    def test_top_level_directory_is_optional(self) -> None:
        command = unittest_tests.build_command(Path("/project"), "tests")
        self.assertNotIn("-t", command.command)
