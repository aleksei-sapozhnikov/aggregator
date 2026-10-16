"""Orchestrator flow tests: code-qa excludes secrets, full qa includes them."""

from __future__ import annotations

import unittest
from contextlib import redirect_stdout
from io import StringIO
from unittest.mock import MagicMock, patch

import main


class OrchestratorFlowTests(unittest.TestCase):
    """Check flow ordering and avoid invoking real formatters or test suites."""

    def test_code_qa_formats_then_runs_tests_without_secrets(self) -> None:
        calls: list[str] = []
        with (
            patch.object(main, "run_format_command", side_effect=lambda **_: calls.append("format") or 0),
            patch.object(main, "run_test_command", side_effect=lambda **_: calls.append("test") or 0),
            patch.object(main, "run_secrets_command") as secrets,
        ):
            self.assertEqual(main.run_code_qa_command(suppress_final_summary=True), 0)
        self.assertEqual(calls, ["format", "test"])
        secrets.assert_not_called()

    def test_code_qa_stops_when_formatting_fails(self) -> None:
        with (
            patch.object(main, "run_format_command", return_value=1),
            patch.object(main, "run_test_command") as tests,
        ):
            with redirect_stdout(StringIO()):
                self.assertEqual(main.run_code_qa_command(), 1)
        tests.assert_not_called()

    def test_full_qa_scans_secrets_only_after_formatting_and_tests(self) -> None:
        calls: list[str] = []
        with (
            patch.object(main, "run_format_command", side_effect=lambda **_: calls.append("format") or 0),
            patch.object(main, "run_test_command", side_effect=lambda **_: calls.append("test") or 0),
            patch.object(main, "run_secrets_command", side_effect=lambda **_: calls.append("secrets") or 0),
            redirect_stdout(StringIO()),
        ):
            self.assertEqual(main.run_qa_command(), 0)
        self.assertEqual(calls, ["format", "test", "secrets"])

    def test_full_qa_skips_secrets_after_test_failure(self) -> None:
        with (
            patch.object(main, "run_format_command", return_value=0),
            patch.object(main, "run_test_command", return_value=1),
            patch.object(main, "run_secrets_command") as secrets,
            redirect_stdout(StringIO()),
        ):
            self.assertEqual(main.run_qa_command(), 1)
        secrets.assert_not_called()

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

    def test_missing_test_process_reports_failure(self) -> None:
        with (
            patch.object(main.subprocess, "Popen", side_effect=FileNotFoundError("python")),
            redirect_stdout(StringIO()) as output,
        ):
            self.assertEqual(main.run_test_command(), 1)
        self.assertIn("Unable to start module tests", output.getvalue())


if __name__ == "__main__":
    unittest.main()
