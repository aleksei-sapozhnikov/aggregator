"""Verify the Java formatter CLI and pinned artifact downloads."""

from __future__ import annotations

import hashlib
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from code_qa.src.checks.format import java_format


class JavaFormatterDownloadTests(unittest.TestCase):
    def test_parser_accepts_explicit_inputs_and_mode(self) -> None:
        with patch.object(
            sys,
            "argv",
            [
                "java_format.py",
                "--root",
                ".",
                "--files-from",
                "paths.json",
                "--check-only",
            ],
        ):
            args = java_format.parse_args()
        self.assertEqual(args.mode, "check")
        self.assertEqual(args.files_from, Path("paths.json"))

    def test_verified_jar_is_installed_and_reused(self) -> None:
        payload = b"verified-jar"
        expected = hashlib.sha256(payload).hexdigest()
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)

            def download(_url: str, target: Path) -> None:
                target.write_bytes(payload)

            with (
                patch.object(java_format, "GOOGLE_JAVA_FORMAT_SHA256", expected),
                patch.object(
                    java_format.urllib.request, "urlretrieve", side_effect=download
                ) as retrieve,
            ):
                first = java_format.ensure_formatter_jar(root)
                second = java_format.ensure_formatter_jar(root)

            self.assertEqual(first, second)
            self.assertEqual(first.read_bytes(), payload)
            retrieve.assert_called_once()

    def test_invalid_download_never_replaces_cached_jar(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)

            def download(_url: str, target: Path) -> None:
                target.write_bytes(b"wrong")

            with (
                patch.object(java_format, "GOOGLE_JAVA_FORMAT_SHA256", "0" * 64),
                patch.object(
                    java_format.urllib.request, "urlretrieve", side_effect=download
                ),
                self.assertRaisesRegex(ValueError, "SHA-256"),
            ):
                java_format.ensure_formatter_jar(root)
            self.assertFalse(java_format.formatter_jar_path(root).exists())


if __name__ == "__main__":
    unittest.main()
