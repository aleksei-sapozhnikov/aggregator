"""Test Maven discovery, checksum verification, and automatic installation."""

from __future__ import annotations

import hashlib
import io
import os
import tempfile
import unittest
import zipfile
from contextlib import redirect_stdout
from io import StringIO
from pathlib import Path
from unittest.mock import patch

import run_maven


def sample_maven_zip() -> bytes:
    """Build a small Maven-shaped distribution without network access."""
    output = io.BytesIO()
    with zipfile.ZipFile(output, "w") as archive:
        archive.writestr(
            f"apache-maven-{run_maven.MAVEN_VERSION}/bin/mvn",
            "#!/bin/sh\nexit 0\n",
        )
        archive.writestr(
            f"apache-maven-{run_maven.MAVEN_VERSION}/bin/mvn.cmd",
            "@echo off\r\n",
        )
    return output.getvalue()


class MavenBootstrapTests(unittest.TestCase):
    """Keep Maven setup reproducible and avoid unverified downloads."""

    def test_uses_maven_on_path_before_downloading(self) -> None:
        with (
            patch.object(run_maven.shutil, "which", return_value="mvn") as which,
            patch.object(run_maven, "ensure_cached_maven") as bootstrap,
        ):
            self.assertEqual(run_maven.resolve_maven_command(Path("/repo")), ("mvn.cmd" if run_maven.sys.platform == "win32" else "mvn"))
        which.assert_called_once()
        bootstrap.assert_not_called()

    def test_downloads_validated_maven_and_reuses_cache(self) -> None:
        payload = sample_maven_zip()
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            with (
                patch.object(run_maven, "MAVEN_ZIP_SHA512", hashlib.sha512(payload).hexdigest()),
                patch.object(run_maven.urllib.request, "urlopen", return_value=io.BytesIO(payload)) as download,
                redirect_stdout(StringIO()),
            ):
                command = run_maven.ensure_cached_maven(root)
                self.assertEqual(command, run_maven.cached_maven_command(root))
                self.assertTrue(command.is_file())
                self.assertEqual(run_maven.ensure_cached_maven(root), command)
            download.assert_called_once()

    def test_rejects_invalid_checksum_without_using_executable(self) -> None:
        payload = sample_maven_zip()
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            with (
                patch.object(run_maven, "MAVEN_ZIP_SHA512", "0" * 128),
                patch.object(run_maven.urllib.request, "urlopen", return_value=io.BytesIO(payload)),
                redirect_stdout(StringIO()) as output,
            ):
                self.assertIsNone(run_maven.ensure_cached_maven(root))
            self.assertIn("SHA-512 verification failed", output.getvalue())
            self.assertFalse(run_maven.cached_maven_command(root).exists())

    def test_maven_environment_suppresses_only_known_unsafe_warning(self) -> None:
        java_home = Path("/qa/jdk-25")
        original_options = os.environ.get("MAVEN_OPTS")
        with patch.dict(os.environ, {"MAVEN_OPTS": "-Xmx1g"}):
            env = run_maven.maven_environment(java_home)

        self.assertEqual(
            env["MAVEN_OPTS"],
            "-Xmx1g --sun-misc-unsafe-memory-access=allow",
        )
        self.assertEqual(env["JAVA_HOME"], str(java_home))
        self.assertTrue(env["PATH"].startswith(str(java_home / "bin")))
        self.assertEqual(os.environ.get("MAVEN_OPTS"), original_options)

    def test_maven_environment_does_not_duplicate_option(self) -> None:
        option = run_maven.MAVEN_UNSAFE_ACCESS_OPTION
        with patch.dict(os.environ, {"MAVEN_OPTS": f"-Xmx1g {option}"}):
            env = run_maven.maven_environment(Path("/qa/jdk-25"))
        self.assertEqual(env["MAVEN_OPTS"], f"-Xmx1g {option}")

    def test_missing_distribution_reports_clear_error(self) -> None:
        with (
            patch.object(run_maven.shutil, "which", return_value=None),
            patch.object(run_maven, "ensure_cached_maven", return_value=None),
            redirect_stdout(StringIO()) as output,
        ):
            self.assertIsNone(run_maven.resolve_maven_command(Path("/repo")))
        self.assertIn("Maven was not found in PATH", output.getvalue())


if __name__ == "__main__":
    unittest.main()
