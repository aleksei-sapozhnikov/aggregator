"""Verify explicit Go package patterns and local caches."""

import unittest
from pathlib import Path

from code_qa.src.checks.tests import go_tests


class GoTests(unittest.TestCase):
    def test_uses_supplied_directory_patterns_and_cache_root(self) -> None:
        workspace, directory = Path("/workspace"), Path("/moved/go")
        command = go_tests.build_command(
            directory, workspace, ["./api/..."], verbose=True
        )
        self.assertEqual(command.command, ["go", "test", "-v", "./api/..."])
        self.assertEqual(command.directory, directory)
        self.assertEqual(
            command.env["GOMODCACHE"], str(workspace / ".temp/qa-runtime/go/modules")
        )
        self.assertEqual(
            command.env["GOCACHE"], str(workspace / ".temp/qa-runtime/go/build")
        )
