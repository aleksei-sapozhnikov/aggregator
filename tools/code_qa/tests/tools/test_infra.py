"""Verify shared, checksum-validated downloads for infrastructure tools."""

from __future__ import annotations

import hashlib
import io
import subprocess
import tempfile
import unittest
import zipfile
from contextlib import redirect_stdout
from pathlib import Path
from unittest.mock import patch

from code_qa.src.tools import infra_common
from code_qa.src.tools.tflint import TFLINT
from code_qa.src.tools.tofu import TOFU


def release_zip(binary: str) -> bytes:
    """Build a fake release archive with one unrelated member."""
    output = io.BytesIO()
    with zipfile.ZipFile(output, "w") as archive:
        archive.writestr(binary, b"portable executable")
        archive.writestr("../unexpected.txt", b"must not be extracted")
    return output.getvalue()


class InfraDownloadsTests(unittest.TestCase):
    def test_verified_download_is_cached_for_each_tool(self) -> None:
        for tool in (TOFU, TFLINT):
            with (
                self.subTest(tool=tool.name),
                tempfile.TemporaryDirectory() as temporary,
            ):
                asset = f"{tool.asset_prefix}_linux_amd64.zip"
                payload = release_zip(tool.name)
                manifest = f"{hashlib.sha256(payload).hexdigest()}  {asset}\n".encode()
                with (
                    patch.object(
                        infra_common, "runtime_dir", return_value=Path(temporary)
                    ),
                    patch.object(
                        infra_common, "host_platform", return_value=("linux", "amd64")
                    ),
                    patch.object(infra_common.shutil, "which", return_value=None),
                    patch.object(
                        infra_common.urllib.request,
                        "urlopen",
                        side_effect=[io.BytesIO(manifest), io.BytesIO(payload)],
                    ) as download,
                    redirect_stdout(io.StringIO()),
                ):
                    binary = Path(infra_common.resolve_tool(tool))
                    self.assertEqual(binary.read_bytes(), b"portable executable")
                    self.assertEqual(infra_common.resolve_tool(tool), str(binary))
                self.assertEqual(download.call_count, 2)
                self.assertTrue(
                    download.call_args_list[0].args[0].endswith(tool.checksums)
                )
                self.assertFalse((binary.parent.parent / "unexpected.txt").exists())

    def test_checksum_failure_never_caches_the_binary(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            manifest = b"0" * 64 + b"  tflint_windows_amd64.zip\n"
            with (
                patch.object(infra_common, "runtime_dir", return_value=Path(temporary)),
                patch.object(
                    infra_common, "host_platform", return_value=("windows", "amd64")
                ),
                patch.object(infra_common.shutil, "which", return_value=None),
                patch.object(
                    infra_common.urllib.request,
                    "urlopen",
                    side_effect=[
                        io.BytesIO(manifest),
                        io.BytesIO(release_zip("tflint.exe")),
                    ],
                ),
                redirect_stdout(io.StringIO()) as output,
            ):
                self.assertIsNone(infra_common.resolve_tool(TFLINT))
            self.assertIn("SHA-256 verification failed", output.getvalue())
            self.assertEqual(list(Path(temporary).rglob("*.exe")), [])
            self.assertEqual(list(Path(temporary).rglob("*.zip")), [])

    def test_matching_installed_version_skips_the_download(self) -> None:
        with (
            tempfile.TemporaryDirectory() as temporary,
            patch.object(infra_common, "runtime_dir", return_value=Path(temporary)),
            patch.object(infra_common.shutil, "which", return_value="existing-tofu"),
            patch.object(infra_common, "matches_version", return_value=True),
            patch.object(infra_common, "download_tool") as download,
        ):
            self.assertEqual(infra_common.resolve_tool(TOFU), "existing-tofu")
        download.assert_not_called()

    def test_wrong_system_version_is_replaced_only_in_the_cache(self) -> None:
        with (
            tempfile.TemporaryDirectory() as temporary,
            patch.object(infra_common, "runtime_dir", return_value=Path(temporary)),
            patch.object(infra_common.shutil, "which", return_value="system-tofu"),
            patch.object(infra_common, "matches_version", return_value=False),
            patch.object(infra_common, "download_tool") as download,
        ):
            result = Path(infra_common.resolve_tool(TOFU))
            self.assertTrue(result.is_relative_to(Path(temporary)))
            self.assertEqual(download.call_args.args[1], result)

    def test_version_probe_rejects_nearby_versions(self) -> None:
        for version, expected in [
            (TOFU.version, True),
            (TOFU.version + "0", False),
            ("1.12.0", False),
        ]:
            with (
                self.subTest(version=version),
                patch.object(
                    infra_common.subprocess,
                    "run",
                    return_value=subprocess.CompletedProcess(
                        [], 0, stdout=f"{TOFU.version_prefix}{version}\n"
                    ),
                ),
            ):
                self.assertEqual(infra_common.matches_version("tofu", TOFU), expected)

    def test_tflint_platform_limitation_is_reported(self) -> None:
        with (
            patch.object(
                infra_common, "host_platform", return_value=("windows", "arm64")
            ),
            redirect_stdout(io.StringIO()) as output,
        ):
            self.assertIsNone(infra_common.resolve_tool(TFLINT))
        self.assertIn("no native release", output.getvalue())


if __name__ == "__main__":
    unittest.main()
