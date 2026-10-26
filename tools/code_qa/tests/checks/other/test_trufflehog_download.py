"""Test checksum verification and restricted TruffleHog extraction."""

from __future__ import annotations

import hashlib
import io
import os
import platform
import tarfile
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from code_qa.src.checks.other import trufflehog


class TruffleHogDownloadTests(unittest.TestCase):
    def test_checksum_mismatch_does_not_install_binary(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)

            def download(_url: str, target: Path) -> None:
                target.write_bytes(b"invalid")

            with (
                patch.object(
                    trufflehog, "trufflehog_release_asset", return_value="test.tar.gz"
                ),
                patch.object(platform, "system", return_value="Linux"),
                patch.object(platform, "machine", return_value="x86_64"),
                patch.object(
                    trufflehog.urllib.request, "urlretrieve", side_effect=download
                ),
            ):
                self.assertIsNone(trufflehog.download_trufflehog_binary(root))
            self.assertFalse(trufflehog.local_binary_candidates(root)[0].exists())

    def test_verified_archive_extracts_only_expected_member(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            executable = "trufflehog.exe" if os.name == "nt" else "trufflehog"
            archive_bytes = io.BytesIO()
            with tarfile.open(fileobj=archive_bytes, mode="w:gz") as archive:
                for name, content in (
                    ("../unwanted", b"bad"),
                    (executable, b"binary"),
                ):
                    info = tarfile.TarInfo(name)
                    info.size = len(content)
                    archive.addfile(info, io.BytesIO(content))

            payload = archive_bytes.getvalue()
            expected = hashlib.sha256(payload).hexdigest()

            def download(_url: str, target: Path) -> None:
                target.write_bytes(payload)

            with (
                patch.object(
                    trufflehog, "trufflehog_release_asset", return_value="test.tar.gz"
                ),
                patch.object(platform, "system", return_value="Linux"),
                patch.object(platform, "machine", return_value="x86_64"),
                patch.dict(
                    trufflehog.TRUFFLEHOG_ARCHIVE_SHA256,
                    {("linux", "amd64"): expected},
                ),
                patch.object(
                    trufflehog.urllib.request, "urlretrieve", side_effect=download
                ),
            ):
                installed = trufflehog.download_trufflehog_binary(root)

            self.assertIsNotNone(installed)
            self.assertEqual(Path(installed).read_bytes(), b"binary")
            self.assertFalse((root / "unwanted").exists())


if __name__ == "__main__":
    unittest.main()
