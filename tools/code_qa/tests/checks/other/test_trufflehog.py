"""Cover TruffleHog scan outcomes and temporary-file cleanup."""

from __future__ import annotations

import subprocess
import sys
import tempfile
import unittest
from contextlib import redirect_stderr, redirect_stdout
from io import StringIO
from pathlib import Path
from unittest.mock import patch

from code_qa.src.checks.other import trufflehog


class TruffleHogScanTests(unittest.TestCase):
    def run_scan(self, *, exit_code: int, stdout: str = "") -> tuple[int, str]:
        with (
            tempfile.TemporaryDirectory() as temporary,
            patch.object(sys, "argv", ["trufflehog.py", "--summary", "--quiet"]),
            patch.object(trufflehog, "find_repo_root", return_value=Path(temporary)),
            patch.object(
                trufflehog, "resolve_trufflehog_binary", return_value="trufflehog"
            ),
            patch.object(trufflehog, "collect_gitignored", return_value=([], [])),
            patch.object(trufflehog, "scoped_scan_targets", return_value=None),
            patch.object(
                trufflehog,
                "run_command",
                return_value=subprocess.CompletedProcess(
                    ["trufflehog"], exit_code, stdout=stdout, stderr=""
                ),
            ),
            redirect_stdout(StringIO()) as output,
            redirect_stderr(StringIO()),
        ):
            result = trufflehog.main()
            return result, output.getvalue()

    def test_success_without_findings_reports_ok(self) -> None:
        result, summary = self.run_scan(exit_code=0)
        self.assertEqual(result, 0)
        self.assertIn("OK: 0 secrets found", summary)

    def test_scanner_error_never_reports_success(self) -> None:
        result, summary = self.run_scan(exit_code=2)
        self.assertEqual(result, 2)
        self.assertIn("FAILED: secret scanner exited with status 2", summary)
        self.assertNotIn("OK: 0 secrets found", summary)

    def test_scanner_error_with_findings_is_incomplete(self) -> None:
        finding = '{"DetectorName":"Example","Verified":false}\n'
        result, summary = self.run_scan(exit_code=2, stdout=finding)
        self.assertEqual(result, 2)
        self.assertIn("scan incomplete", summary)
        self.assertNotIn("OK: 0 secrets found", summary)

    def test_finding_reports_failure(self) -> None:
        finding = '{"DetectorName":"Example","Verified":false}\n'
        result, summary = self.run_scan(exit_code=0, stdout=finding)
        self.assertEqual(result, 1)
        self.assertIn("FAILED: 1 potential secret(s) found", summary)

    def test_no_scoped_targets_does_not_create_temp_exclusion_file(self) -> None:
        with (
            tempfile.TemporaryDirectory() as temporary,
            patch.object(sys, "argv", ["trufflehog.py", "--summary", "--quiet"]),
            patch.object(trufflehog, "find_repo_root", return_value=Path(temporary)),
            patch.object(
                trufflehog, "resolve_trufflehog_binary", return_value="trufflehog"
            ),
            patch.object(trufflehog, "collect_gitignored", return_value=([], [])),
            patch.object(trufflehog, "scoped_scan_targets", return_value=[]),
            patch.object(trufflehog.tempfile, "NamedTemporaryFile") as create_temp,
            redirect_stdout(StringIO()) as output,
        ):
            self.assertEqual(trufflehog.main(), 0)
        create_temp.assert_not_called()
        self.assertIn("OK: 0 secrets found", output.getvalue())


if __name__ == "__main__":
    unittest.main()
