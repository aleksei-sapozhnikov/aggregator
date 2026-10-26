"""Tests for the optional Eclipse Temurin JDK 25 bootstrap."""

from __future__ import annotations

import hashlib
import io
import json
import os
import sys
import tempfile
import unittest
import zipfile
from contextlib import redirect_stdout
from io import StringIO
from pathlib import Path
from unittest.mock import patch

from code_qa.src.checks.format import java_format as run_java_format
from code_qa.src.core.inputs import FileInputs
from code_qa.src.tools import jdk as run_jdk


class JDKBootstrapTests(unittest.TestCase):
    """Keep downloaded JDK installation isolated, verified, and reusable."""

    def test_uses_installed_jdk_25_before_downloading(self) -> None:
        home = Path("/installed/jdk-25")
        with (
            patch.dict(os.environ, {"JAVA_HOME": str(home)}),
            patch.object(run_jdk, "is_jdk_25", return_value=True),
            patch.object(run_jdk, "bootstrap_temurin") as download,
        ):
            self.assertEqual(run_jdk.resolve_java_home(Path("/repo")), home)
        download.assert_not_called()

    def test_ignores_older_jdk_and_reuses_cached_temurin(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            cached = root / ".temp" / "qa-runtime" / "jdk" / "temurin-25-linux-x64"
            cached.mkdir(parents=True)
            with (
                patch.dict(os.environ, {"JAVA_HOME": "/outdated/jdk"}, clear=False),
                patch.object(
                    run_jdk, "platform_details", return_value=("linux", "x64")
                ),
                patch.object(run_jdk.shutil, "which", return_value=None),
                patch.object(
                    run_jdk, "is_jdk_25", side_effect=lambda path: path == cached
                ),
                patch.object(run_jdk, "bootstrap_temurin") as download,
            ):
                self.assertEqual(run_jdk.resolve_java_home(root), cached)
            download.assert_not_called()

    def test_java_environment_does_not_modify_parent_environment(self) -> None:
        original = dict(os.environ)
        home = Path("/some/jdk-25")
        env = run_jdk.java_environment(home)
        self.assertEqual(env["JAVA_HOME"], str(home))
        self.assertTrue(env["PATH"].startswith(str(home / "bin") + os.pathsep))
        self.assertEqual(dict(os.environ), original)

    def test_metadata_requires_official_https_source_and_sha256(self) -> None:
        url = (
            "https://github.com/adoptium/temurin25-binaries/releases/download/"
            "jdk-25.0.4.1%2B1/OpenJDK25U-jdk_x64_windows_hotspot_25.0.4.1_1.zip"
        )
        checksum = "ab" * 32

        def metadata(link: str, digest: str) -> io.BytesIO:
            return io.BytesIO(
                json.dumps(
                    [{"binary": {"package": {"link": link, "checksum": digest}}}]
                ).encode()
            )

        with (
            patch.object(run_jdk, "platform_details", return_value=("windows", "x64")),
            patch.object(
                run_jdk.urllib.request,
                "urlopen",
                return_value=metadata(url, checksum),
            ),
        ):
            self.assertEqual(run_jdk.adoptium_package(), (url, checksum))

        with (
            patch.object(run_jdk, "platform_details", return_value=("windows", "x64")),
            patch.object(
                run_jdk.urllib.request,
                "urlopen",
                return_value=metadata("https://evil.example/temurin.zip", checksum),
            ),
            self.assertRaisesRegex(ValueError, "Unexpected Temurin download source"),
        ):
            run_jdk.adoptium_package()

    def test_adoptium_rejects_incorrect_metadata_types(self) -> None:
        invalid_metadata = [
            ([None], "Invalid Adoptium release metadata"),
            ([{"binary": None}], "Invalid Adoptium binary metadata"),
            ([{"binary": {"package": None}}], "Invalid Adoptium package metadata"),
            (
                [{"binary": {"package": {"link": 123, "checksum": "a" * 64}}}],
                "Adoptium release lacks download link or SHA-256",
            ),
        ]
        for payload, message in invalid_metadata:
            with (
                self.subTest(payload=payload),
                patch.object(
                    run_jdk, "platform_details", return_value=("windows", "x64")
                ),
                patch.object(
                    run_jdk.urllib.request,
                    "urlopen",
                    return_value=io.BytesIO(json.dumps(payload).encode("utf-8")),
                ),
                self.assertRaisesRegex(TypeError, message),
            ):
                run_jdk.adoptium_package()

    def test_verified_archive_is_cached_and_reused(self) -> None:
        data = io.BytesIO()
        with zipfile.ZipFile(data, "w") as archive:
            archive.writestr("jdk-25/bin/java.exe", "fake")
            archive.writestr("jdk-25/bin/javac.exe", "fake")

        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            with (
                patch.object(
                    run_jdk, "platform_details", return_value=("windows", "x64")
                ),
                patch.object(
                    run_jdk,
                    "adoptium_package",
                    return_value=(
                        (
                            "https://github.com/adoptium/temurin25-binaries/"
                            "releases/download/anything"
                        ),
                        hashlib.sha256(data.getvalue()).hexdigest(),
                    ),
                ),
                patch.object(
                    run_jdk.urllib.request,
                    "urlopen",
                    return_value=io.BytesIO(data.getvalue()),
                ) as fetch,
                patch.object(
                    run_jdk,
                    "is_jdk_25",
                    side_effect=lambda home: (
                        (home / "bin" / "java.exe").exists()
                        and (home / "bin" / "javac.exe").exists()
                    ),
                ),
                redirect_stdout(StringIO()),
            ):
                home = run_jdk.bootstrap_temurin(root)
                self.assertEqual(home, run_jdk.cached_jdk_root(root))
                self.assertEqual(run_jdk.bootstrap_temurin(root), home)
            fetch.assert_called_once()
            self.assertTrue((home / "bin" / "javac.exe").is_file())

    def test_checksum_mismatch_does_not_install_executable(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            with (
                patch.object(
                    run_jdk, "platform_details", return_value=("windows", "x64")
                ),
                patch.object(
                    run_jdk,
                    "adoptium_package",
                    return_value=(
                        (
                            "https://github.com/adoptium/temurin25-binaries/"
                            "releases/download/anything"
                        ),
                        "0" * 64,
                    ),
                ),
                patch.object(
                    run_jdk.urllib.request,
                    "urlopen",
                    return_value=io.BytesIO(b"invalid"),
                ),
                redirect_stdout(StringIO()) as output,
            ):
                self.assertIsNone(run_jdk.bootstrap_temurin(root))
            self.assertIn("SHA-256 checksum verification failed", output.getvalue())
            self.assertFalse(run_jdk.cached_jdk_root(root).exists())

    def test_archive_path_traversal_is_rejected(self) -> None:
        for path in (
            "../evil",
            "/tmp/evil",
            "a/../../evil",
            "C:/evil",
            r"C:\Windows\evil",
            r"..\evil",
            r"\\server\share\evil",
        ):
            with self.subTest(path=path), self.assertRaises(ValueError):
                run_jdk.validate_archive_path(path)

    def test_safe_archive_paths_are_accepted(self) -> None:
        for path in (
            "jdk-25/bin/java",
            "jdk-25/lib/modules",
            "jdk-25/Contents/Home/bin/java",
        ):
            with self.subTest(path=path):
                run_jdk.validate_archive_path(path)

    def test_java_formatter_uses_resolved_jdk_executable(self) -> None:
        home = Path("jdk-25")
        with (
            patch.object(
                sys,
                "argv",
                [
                    "code_qa.src.checks.format.java_format",
                    "--check-only",
                    "--root",
                    ".",
                    "--files-from",
                    "unused.json",
                ],
            ),
            patch.object(run_java_format.os, "chdir"),
            patch.object(run_java_format, "resolve_java_home", return_value=home),
            patch.object(
                run_java_format,
                "ensure_formatter_jar",
                return_value=Path("formatter.jar"),
            ),
            patch.object(
                run_java_format,
                "file_inputs",
                return_value=FileInputs(Path("/repo"), [Path("/repo/A.java")]),
            ),
            patch.object(run_java_format, "run_formatter", return_value=0) as formatter,
        ):
            self.assertEqual(run_java_format.main(), 0)
        self.assertEqual(
            formatter.call_args.kwargs["java_command"],
            str(run_jdk.jdk_executable(home, "java")),
        )


if __name__ == "__main__":
    unittest.main()
