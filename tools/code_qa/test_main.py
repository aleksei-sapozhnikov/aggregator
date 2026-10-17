"""Orchestrator flow tests: code-qa excludes secrets, full qa includes them."""

from __future__ import annotations

import sys
import unittest
from contextlib import redirect_stdout
from io import BytesIO, StringIO, TextIOWrapper
from unittest.mock import MagicMock, patch

import main
import utils


class OrchestratorFlowTests(unittest.TestCase):
    """Check flow ordering and avoid invoking real formatters or test suites."""

    def test_code_qa_checks_then_runs_tests_without_secrets(self) -> None:
        calls: list[str] = []
        with (
            patch.object(
                main,
                "run_check_command",
                side_effect=lambda **_: calls.append("check") or 0,
            ),
            patch.object(
                main,
                "run_test_command",
                side_effect=lambda **_: calls.append("test") or 0,
            ),
            patch.object(main, "run_secrets_command") as secrets,
        ):
            self.assertEqual(main.run_code_qa_command(suppress_final_summary=True), 0)
        self.assertEqual(calls, ["check", "test"])
        secrets.assert_not_called()

    def test_code_qa_stops_when_checks_fail_without_formatting(self) -> None:
        with (
            patch.object(main, "run_check_command", return_value=1),
            patch.object(main, "run_format_command") as formatter,
            patch.object(main, "run_test_command") as tests,
            redirect_stdout(StringIO()),
        ):
            self.assertEqual(main.run_code_qa_command(), 1)
        formatter.assert_not_called()
        tests.assert_not_called()

    def test_full_qa_scans_secrets_only_after_checks_and_tests(self) -> None:
        calls: list[str] = []
        with (
            patch.object(
                main,
                "run_check_command",
                side_effect=lambda **_: calls.append("check") or 0,
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
        self.assertEqual(calls, ["check", "test", "secrets"])

    def test_full_qa_skips_secrets_after_test_failure(self) -> None:
        with (
            patch.object(main, "run_check_command", return_value=0),
            patch.object(main, "run_test_command", return_value=1),
            patch.object(main, "run_secrets_command") as secrets,
            redirect_stdout(StringIO()) as output,
        ):
            self.assertEqual(main.run_qa_command(), 1)
        secrets.assert_not_called()
        self.assertIn("Skipping secrets scan", output.getvalue())
        self.assertIn("=== QA: FAILED ===", output.getvalue())

    def test_full_qa_skips_secrets_after_check_failure(self) -> None:
        with (
            patch.object(main, "run_check_command", return_value=1),
            patch.object(main, "run_test_command") as tests,
            patch.object(main, "run_secrets_command") as secrets,
            redirect_stdout(StringIO()) as output,
        ):
            self.assertEqual(main.run_qa_command(), 1)
        tests.assert_not_called()
        secrets.assert_not_called()
        self.assertIn("Skipping secrets scan", output.getvalue())
        self.assertIn("=== QA: FAILED ===", output.getvalue())

    def test_full_qa_fails_when_only_secret_scan_fails(self) -> None:
        with (
            patch.object(main, "run_check_command", return_value=0),
            patch.object(main, "run_test_command", return_value=0),
            patch.object(main, "run_secrets_command", return_value=1),
            redirect_stdout(StringIO()),
        ):
            self.assertEqual(main.run_qa_command(), 1)

    def test_qa_never_formats_even_when_all_checks_pass(self) -> None:
        with (
            patch.object(main, "run_check_command", return_value=0) as check,
            patch.object(main, "run_format_command") as formatter,
            patch.object(main, "run_test_command", return_value=0) as tests,
            patch.object(main, "run_secrets_command", return_value=0) as secrets,
            redirect_stdout(StringIO()),
        ):
            self.assertEqual(main.run_qa_command(), 0)
        check.assert_called_once()
        formatter.assert_not_called()
        tests.assert_called_once()
        secrets.assert_called_once()

    def test_code_format_still_applies_fixes(self) -> None:
        with (
            patch.object(
                main, "_run_checks",
                side_effect=[(False, ["ruff"]), (True, [])],
            ),
            patch.object(main, "run_script", return_value=(True, [])) as fix,
            redirect_stdout(StringIO()),
        ):
            self.assertEqual(main.run_format_command(), 0)
        fix.assert_called_once_with("run_ruff.py", ["--format"])

    def test_code_format_tries_remaining_fixers_after_failure(self) -> None:
        with (
            patch.object(
                main,
                "_run_checks",
                side_effect=[
                    (False, ["ruff", "trailing-whitespace"]),
                    (False, ["ruff"]),
                ],
            ) as checks,
            patch.object(
                main,
                "run_script",
                side_effect=[
                    (False, ["Manual Ruff fix required"]),
                    (True, []),
                ],
            ) as fix,
            redirect_stdout(StringIO()) as output,
        ):
            self.assertEqual(main.run_format_command(), 1)

        self.assertEqual(checks.call_count, 2)
        self.assertEqual(
            [call.args for call in fix.call_args_list],
            [
                ("run_ruff.py", ["--format"]),
                ("run_trailing_whitespace.py", ["--format"]),
            ],
        )
        self.assertIn("Manual Ruff fix required", output.getvalue())
        self.assertIn("=== QA: FAILED ===", output.getvalue())

    def test_run_script_keeps_every_failure_line(self) -> None:
        violations = [f"Ruff violation {index}" for index in range(25)]
        result = MagicMock(
            returncode=1,
            stdout="\n".join(violations),
            stderr="Additional diagnostics",
        )
        with patch.object(utils.subprocess, "run", return_value=result) as run:
            ok, details = utils.run_script("run_ruff.py", ["--check-only"])

        self.assertFalse(ok)
        self.assertEqual(details, [*violations, "Additional diagnostics"])
        self.assertTrue(run.call_args.kwargs["capture_output"])

    def test_checks_continue_and_print_all_failure_diagnostics(self) -> None:
        checks = [
            main.CheckSpec("ruff", "ruff", "run_ruff.py", ["--check-only"], None),
            main.CheckSpec(
                "prettier", "prettier", "run_prettier.py", ["--check-only"], None
            ),
        ]
        violations = [f"Ruff violation {index}" for index in range(25)]
        output = StringIO()
        with (
            patch.object(main, "CHECKS", checks),
            patch.object(
                main,
                "run_script",
                side_effect=[(False, violations), (False, ["Prettier violation"])],
            ) as run,
            redirect_stdout(output),
        ):
            ok, failed = main._run_checks(print)

        self.assertFalse(ok)
        self.assertEqual(failed, ["ruff", "prettier"])
        self.assertEqual(run.call_count, 2)
        self.assertIn("Ruff violation 24", output.getvalue())
        self.assertIn("Prettier violation", output.getvalue())

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

    def test_test_output_replaces_unicode_status_symbols(self) -> None:
        process = MagicMock()
        process.stdout = iter([
            "✓ sample.test.tsx > passes\n",
            "✗ sample.test.tsx > fails\n",
            "❯ sample.test.tsx > nested case\n",
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
        self.assertIn("> sample.test.tsx > nested case", output.getvalue())
        self.assertNotIn("✓", output.getvalue())
        self.assertNotIn("✗", output.getvalue())
        self.assertIn("=== QA: FAILED ===", output.getvalue())
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

    def test_verbose_test_flag_is_passed_to_module_runner(self) -> None:
        process = MagicMock()
        process.stdout = iter([])
        process.wait.return_value = 0
        process.__enter__.return_value = process
        with (
            patch.object(main.subprocess, "Popen", return_value=process) as popen,
            redirect_stdout(StringIO()),
        ):
            self.assertEqual(
                main.run_test_command(modules=["catalog"], verbose=True), 0
            )
        self.assertEqual(
            popen.call_args.args[0][-3:], ["--module", "catalog", "--verbose"]
        )


if __name__ == "__main__":
    unittest.main()
