"""Orchestrator flow tests: code-qa excludes secrets, full qa includes them."""

from __future__ import annotations

import sys
import unittest
from contextlib import redirect_stdout
from io import BytesIO, StringIO, TextIOWrapper
from unittest.mock import MagicMock, patch

import main


class OrchestratorFlowTests(unittest.TestCase):
    """Check flow ordering and avoid invoking real formatters or test suites."""

    def test_code_qa_formats_then_runs_tests_without_secrets(self) -> None:
        calls: list[str] = []
        with (
            patch.object(
                main,
                "run_format_command",
                side_effect=lambda **_: calls.append("format") or 0,
            ),
            patch.object(
                main,
                "run_test_command",
                side_effect=lambda **_: calls.append("test") or 0,
            ),
            patch.object(main, "run_secrets_command") as secrets,
        ):
            self.assertEqual(main.run_code_qa_command(suppress_final_summary=True), 0)
        self.assertEqual(calls, ["format", "test"])
        secrets.assert_not_called()

    def test_code_qa_stops_when_formatting_fails(self) -> None:
        with (
            patch.object(main, "run_format_command", return_value=1),
            patch.object(main, "run_test_command") as tests,
            redirect_stdout(StringIO()),
        ):
            self.assertEqual(main.run_code_qa_command(), 1)
        tests.assert_not_called()

    def test_full_qa_scans_secrets_only_after_formatting_and_tests(self) -> None:
        calls: list[str] = []
        with (
            patch.object(
                main,
                "run_format_command",
                side_effect=lambda **_: calls.append("format") or 0,
            ),
            patch.object(
                main,
                "run_test_command",
                side_effect=lambda **_: calls.append("test") or 0,
            ),
            patch.object(
                main,
                "run_secrets_command",
                side_effect=lambda **_: calls.append("secrets") or 0,
            ),
            redirect_stdout(StringIO()),
        ):
            self.assertEqual(main.run_qa_command(), 0)
        self.assertEqual(calls, ["format", "test", "secrets"])

    def test_full_qa_scans_secrets_after_test_failure(self) -> None:
        with (
            patch.object(main, "run_format_command", return_value=0),
            patch.object(main, "run_test_command", return_value=1),
            patch.object(main, "run_secrets_command", return_value=0) as secrets,
            redirect_stdout(StringIO()),
        ):
            self.assertEqual(main.run_qa_command(), 1)
        secrets.assert_called_once()

    def test_full_qa_scans_secrets_after_format_failure(self) -> None:
        with (
            patch.object(main, "run_format_command", return_value=1),
            patch.object(main, "run_test_command") as tests,
            patch.object(main, "run_secrets_command", return_value=0) as secrets,
            redirect_stdout(StringIO()),
        ):
            self.assertEqual(main.run_qa_command(), 1)
        tests.assert_not_called()
        secrets.assert_called_once()

    def test_full_qa_fails_when_only_secret_scan_fails(self) -> None:
        with (
            patch.object(main, "run_format_command", return_value=0),
            patch.object(main, "run_test_command", return_value=0),
            patch.object(main, "run_secrets_command", return_value=1),
            redirect_stdout(StringIO()),
        ):
            self.assertEqual(main.run_qa_command(), 1)

    def test_test_output_is_streamed_without_truncation(self) -> None:
        process = MagicMock()
        process.stdout = iter(["Starting tests\n", "one passed\n", "two passed\n"])
        process.wait.return_value = 0
        process.__enter__.return_value = process
        output = StringIO()
        with (
            patch.object(main.subprocess, "Popen", return_value=process) as popen,
            redirect_stdout(output),
        ):
            self.assertEqual(main.run_test_command(modules=["catalog"]), 0)
        self.assertIn("Starting tests", output.getvalue())
        self.assertIn("two passed", output.getvalue())
        self.assertIn("=== QA: PASSED ===", output.getvalue())
        self.assertEqual(popen.call_args.args[0][-2:], ["--module", "catalog"])

    def test_test_output_is_plain_text_even_with_ansi_codes(self) -> None:
        process = MagicMock()
        process.stdout = iter([
            "\x1b[32m✓\x1b[39m sample.test.tsx > passes\n",
            "\x1b[31m✗\x1b[39m sample.test.tsx > fails\n",
        ])
        process.wait.return_value = 1
        process.__enter__.return_value = process
        output = StringIO()
        with (
            patch.object(main.subprocess, "Popen", return_value=process) as popen,
            redirect_stdout(output),
        ):
            self.assertEqual(main.run_test_command(modules=["aggregator-ui"]), 1)
        self.assertIn("PASS sample.test.tsx > passes", output.getvalue())
        self.assertIn("FAIL sample.test.tsx > fails", output.getvalue())
        self.assertNotIn("\x1b[", output.getvalue())
        self.assertNotIn("✓", output.getvalue())
        self.assertEqual(
            popen.call_args.kwargs["env"]["PYTHONIOENCODING"], "utf-8"
        )

    def test_redirected_cp1251_stdout_preserves_unicode_test_output(self) -> None:
        """Windows redirected stdout must not crash on Unicode from test tools."""
        process = MagicMock()
        process.stdout = iter(
            ["Testing catalog: \u2713 passed, \u4e2d\u6587 supported\n"]
        )
        process.wait.return_value = 0
        process.__enter__.return_value = process

        buffer = BytesIO()
        redirected_stdout = TextIOWrapper(buffer, encoding="cp1251")
        try:
            with (
                patch.object(sys, "stdout", redirected_stdout),
                patch.object(sys, "argv", ["main.py", "test", "--module", "catalog"]),
                patch.object(main.subprocess, "Popen", return_value=process),
            ):
                self.assertEqual(main.main(), 0)
                redirected_stdout.flush()
                self.assertEqual(redirected_stdout.encoding, "utf-8")
        finally:
            redirected_stdout.detach()

        output = buffer.getvalue().decode("utf-8")
        self.assertIn("PASS passed, \u4e2d\u6587 supported", output)
        self.assertIn("=== QA: PASSED ===", output)

    def test_missing_test_process_reports_failure(self) -> None:
        with (
            patch.object(
                main.subprocess, "Popen", side_effect=FileNotFoundError("python")
            ),
            redirect_stdout(StringIO()) as output,
        ):
            self.assertEqual(main.run_test_command(), 1)
        self.assertIn("Unable to start module tests", output.getvalue())


if __name__ == "__main__":
    unittest.main()
