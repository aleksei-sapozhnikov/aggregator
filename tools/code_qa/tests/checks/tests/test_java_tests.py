"""Verify Java test preparation for arbitrary project directories."""

import unittest
from pathlib import Path
from unittest.mock import patch

from code_qa.src.checks.tests import java_tests


class JavaTests(unittest.TestCase):
    def test_maven_uses_local_cache_and_resolved_jdk(self) -> None:
        workspace, directory, home = (
            Path("/workspace"),
            Path("/moved/java"),
            Path("/jdk"),
        )
        with (
            patch.object(java_tests, "resolve_java_home", return_value=home) as java,
            patch.object(
                java_tests, "resolve_maven_command", return_value="mvn.cmd"
            ) as maven,
        ):
            command = java_tests.build_command(directory, workspace)
            verbose = java_tests.build_command(directory, workspace, verbose=True)
        self.assertEqual(command.directory, directory)
        self.assertEqual(
            command.command,
            [
                "mvn.cmd",
                "-q",
                "-B",
                f"-Dmaven.repo.local={workspace / '.local/qa-runtime/maven-repository'}",
                "test",
            ],
        )
        self.assertNotIn("-q", verbose.command)
        self.assertEqual(command.env["JAVA_HOME"], str(home))
        self.assertIn(
            "--sun-misc-unsafe-memory-access=allow", command.env["MAVEN_OPTS"].split()
        )
        self.assertTrue(command.env["PATH"].startswith(str(home / "bin")))
        java.assert_called_with(workspace)
        maven.assert_called_with(workspace)

    def test_missing_jdk_stops_setup(self) -> None:
        with (
            patch.object(java_tests, "resolve_java_home", return_value=None),
            patch.object(java_tests, "resolve_maven_command") as maven,
        ):
            self.assertIsNone(
                java_tests.build_command(Path("/project"), Path("/workspace"))
            )
        maven.assert_not_called()

    def test_missing_maven_stops_setup(self) -> None:
        with (
            patch.object(java_tests, "resolve_java_home", return_value=Path("/jdk")),
            patch.object(java_tests, "resolve_maven_command", return_value=None),
        ):
            self.assertIsNone(
                java_tests.build_command(Path("/project"), Path("/workspace"))
            )
