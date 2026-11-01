"""Orchestrator flow tests: code-qa excludes secrets, full qa includes them."""

from __future__ import annotations

import sys
import unittest
from contextlib import redirect_stdout
from io import BytesIO, StringIO, TextIOWrapper
from unittest.mock import MagicMock, patch

from code_qa.src.core import cli as main
from code_qa.src.core import utils


class OrchestratorFlowTests(unittest.TestCase):
    """Check flow ordering and avoid invoking real formatters or test suites."""

    def setUp(self) -> None:
        files = patch.object(main, "iter_repo_files", return_value=[])
        changed = patch.object(main, "scoped_paths", return_value=None)
        files.start()
        changed.start()
        self.addCleanup(changed.stop)
        self.addCleanup(files.stop)

    def test_code_qa_runs_tests_after_checks_within_each_module(self) -> None:
        output = StringIO()
        with (
            patch.object(main, "execute_check", return_value=(True, [])),
            patch.object(main, "execute_test", return_value=(0, [])) as tests,
            patch.object(main, "run_secrets_command") as secrets,
            redirect_stdout(output),
        ):
            self.assertEqual(
                main.run_code_qa_command(modules=["aggregator", "aggregator-ui"]), 0
            )

        log = output.getvalue()
        markers = [
            "Module: aggregator\n",
            "  Checking java format.. ",
            "  Testing aggregator.. OK",
            "Module: aggregator-ui\n",
            "  Checking typescript.. ",
            "  Testing aggregator-ui.. OK",
        ]
        # Every module's checks finish before its tests and the next module.
        self.assertEqual(
            sorted(log.index(value) for value in markers),
            [log.index(value) for value in markers],
        )
        self.assertEqual(tests.call_count, 2)
        secrets.assert_not_called()
        self.assertNotIn("=== TESTS:", log)

    def test_code_qa_skips_only_failing_module_tests(self) -> None:
        events: list[str] = []

        def check(_emit, selected, **_kwargs):
            name = selected[0]
            events.append(f"check:{name}")
            return (name != "aggregator", [])

        def test(command, _emit, *, verbose):
            events.append("test:aggregator-ui")
            return 0, []

        with (
            patch.object(main, "_run_checks", side_effect=check),
            patch.object(main, "execute_test", side_effect=test) as tests,
            patch.object(main, "run_format_command") as formatter,
            redirect_stdout(StringIO()) as output,
        ):
            self.assertEqual(
                main.run_code_qa_command(modules=["aggregator", "aggregator-ui"]), 1
            )

        self.assertEqual(
            events, ["check:aggregator", "check:aggregator-ui", "test:aggregator-ui"]
        )
        tests.assert_called_once()
        formatter.assert_not_called()
        self.assertIn("Testing aggregator.. SKIPPED (checks failed)", output.getvalue())
        self.assertIn("Testing aggregator-ui.. OK", output.getvalue())
        self.assertIn("=== QA: FAILED ===", output.getvalue())

    def test_code_qa_continues_after_test_failure_and_reports_details(self) -> None:
        with (
            patch.object(main, "_run_checks", return_value=(True, [])),
            patch.object(
                main,
                "execute_test",
                side_effect=[(1, ["test failure details"]), (0, [])],
            ) as tests,
            redirect_stdout(StringIO()) as output,
        ):
            self.assertEqual(
                main.run_code_qa_command(modules=["aggregator", "aggregator-ui"]), 1
            )
        self.assertEqual(tests.call_count, 2)
        self.assertIn("Testing aggregator.. FAILED", output.getvalue())
        self.assertIn("test failure details", output.getvalue())
        self.assertIn("Testing aggregator-ui.. OK", output.getvalue())

    def test_code_qa_does_not_run_tests_for_modules_without_suites(self) -> None:
        with (
            patch.object(main, "_run_checks", return_value=(True, [])) as checks,
            patch.object(main, "execute_test") as tests,
            redirect_stdout(StringIO()) as output,
        ):
            self.assertEqual(main.run_code_qa_command(modules=["repository"]), 0)
        checks.assert_called_once()
        tests.assert_not_called()
        self.assertNotIn("Testing repository", output.getvalue())

    def test_full_qa_scans_secrets_only_after_checks_and_tests(self) -> None:
        events: list[str] = []

        def check(_emit, selected, **_kwargs):
            events.append("check:" + selected[0])
            return True, []

        def test(_command, _emit, *, verbose):
            events.append("test")
            return 0, []

        with (
            patch.object(main, "_run_checks", side_effect=check),
            patch.object(main, "execute_test", side_effect=test),
            patch.object(
                main,
                "run_secrets_command",
                side_effect=lambda **_: events.append("secrets") or 0,
            ),
            redirect_stdout(StringIO()),
        ):
            self.assertEqual(main.run_qa_command(modules=["catalog"]), 0)
        self.assertEqual(events, ["check:catalog", "test", "secrets"])

    def test_full_qa_skips_secrets_after_test_failure(self) -> None:
        with (
            patch.object(main, "_run_checks", return_value=(True, [])),
            patch.object(main, "execute_test", return_value=(1, ["test failure"])),
            patch.object(main, "run_secrets_command") as secrets,
            redirect_stdout(StringIO()) as output,
        ):
            self.assertEqual(main.run_qa_command(modules=["catalog"]), 1)
        secrets.assert_not_called()
        self.assertIn("Skipping secrets scan", output.getvalue())
        self.assertIn("=== QA: FAILED ===", output.getvalue())

    def test_full_qa_skips_secrets_after_check_failure(self) -> None:
        with (
            patch.object(main, "_run_checks", return_value=(False, ["catalog/error"])),
            patch.object(main, "execute_test") as tests,
            patch.object(main, "run_secrets_command") as secrets,
            redirect_stdout(StringIO()) as output,
        ):
            self.assertEqual(main.run_qa_command(modules=["catalog"]), 1)
        tests.assert_not_called()
        secrets.assert_not_called()
        self.assertIn("Skipping secrets scan", output.getvalue())

    def test_full_qa_fails_when_only_secret_scan_fails(self) -> None:
        with (
            patch.object(main, "_run_checks", return_value=(True, [])),
            patch.object(main, "execute_test", return_value=(0, [])),
            patch.object(main, "run_secrets_command", return_value=1),
            redirect_stdout(StringIO()),
        ):
            self.assertEqual(main.run_qa_command(modules=["catalog"]), 1)

    def test_qa_never_formats_even_when_all_checks_pass(self) -> None:
        with (
            patch.object(main, "_run_checks", return_value=(True, [])) as checks,
            patch.object(main, "execute_test", return_value=(0, [])) as tests,
            patch.object(main, "run_format_command") as formatter,
            patch.object(main, "run_secrets_command", return_value=0) as secrets,
            redirect_stdout(StringIO()),
        ):
            self.assertEqual(main.run_qa_command(modules=["catalog"]), 0)
        checks.assert_called_once()
        tests.assert_called_once()
        formatter.assert_not_called()
        secrets.assert_called_once()

    def test_secrets_are_printed_as_a_separate_block_after_modules(self) -> None:
        result = main.subprocess.CompletedProcess(
            [],
            0,
            stdout="Scan scope: /repo (recursive filesystem)\nOK: 0 secrets found\n",
            stderr="",
        )

        def previous_checks(**_kwargs):
            print("Module: repository")
            print("  Checking final newline.. OK")
            return 0

        with (
            patch.object(main, "run_code_qa_command", side_effect=previous_checks),
            patch.object(main.subprocess, "run", return_value=result),
            redirect_stdout(StringIO()) as output,
        ):
            self.assertEqual(main.run_qa_command(), 0)

        self.assertIn(
            "  Checking final newline.. OK\n"
            "\nSecrets scan\n"
            "  Checking secrets with Trufflehog.. OK\n"
            "  Scan scope: /repo (recursive filesystem)\n"
            "  0 secrets found",
            output.getvalue(),
        )
        self.assertIn("=== QA: PASSED ===", output.getvalue())

    def test_secret_scan_scope_is_preserved_in_compact_output(self) -> None:
        result = main.subprocess.CompletedProcess(
            [],
            0,
            stdout=(
                "Scan scope: /repo (recursive filesystem; excluding .git "
                "and Git-ignored paths)\nOK: 0 secrets found\n"
            ),
            stderr="",
        )
        with (
            patch.object(main.subprocess, "run", return_value=result),
            redirect_stdout(StringIO()) as output,
        ):
            self.assertEqual(
                main.run_secrets_command(
                    scan_root=".",
                    output_file=None,
                    gitignored_output_file=None,
                    binary=None,
                    raw=False,
                ),
                0,
            )
        self.assertIn("Scan scope: /repo", output.getvalue())
        self.assertIn("0 secrets found", output.getvalue())

    def test_qa_format_fixes_and_tests_each_module_before_the_next(self) -> None:
        events: list[str] = []
        checks_per_module: dict[str, int] = {}

        def check(_emit, selected, **_kwargs):
            name = selected[0]
            checks_per_module[name] = checks_per_module.get(name, 0) + 1
            events.append(f"check:{name}")
            if name == "aggregator" and checks_per_module[name] == 1:
                return False, ["aggregator/java-format"]
            return True, []

        def fix(spec, _args, *_positional, **_kwargs):
            events.append(f"fix:{spec.check_id}")
            return True, []

        def test(command, _emit, *, verbose):
            name = "aggregator" if "services-core/aggregator" in command else "aggregator-ui"
            events.append(f"test:{name}")
            return 0, []

        with (
            patch.object(main, "_run_checks", side_effect=check),
            patch.object(main, "execute_check", side_effect=fix),
            patch.object(main, "execute_test", side_effect=test),
            patch.object(
                main,
                "run_secrets_command",
                side_effect=lambda **_: events.append("secrets") or 0,
            ),
            redirect_stdout(StringIO()),
        ):
            self.assertEqual(
                main.run_qa_command(
                    modules=["aggregator", "aggregator-ui"],
                    format_before_tests=True,
                ),
                0,
            )

        self.assertEqual(
            events,
            [
                "check:aggregator",
                "fix:aggregator/java-format",
                "check:aggregator",
                "test:aggregator",
                "check:aggregator-ui",
                "test:aggregator-ui",
                "secrets",
            ],
        )

    def test_qa_format_skips_tests_for_unfixable_module(self) -> None:
        events: list[str] = []

        def check(_emit, selected, **_kwargs):
            name = selected[0]
            events.append(f"check:{name}")
            if name == "aggregator":
                return False, ["aggregator/java-format"]
            return True, []

        with (
            patch.object(main, "_run_checks", side_effect=check),
            patch.object(
                main,
                "execute_check",
                side_effect=lambda *_args, **_kwargs: (True, []),
            ) as fix,
            patch.object(
                main,
                "execute_test",
                side_effect=lambda *_args, **_kwargs: (0, []),
            ) as tests,
            patch.object(main, "run_secrets_command") as secrets,
            redirect_stdout(StringIO()) as output,
        ):
            self.assertEqual(
                main.run_qa_command(
                    modules=["aggregator", "aggregator-ui"],
                    format_before_tests=True,
                ),
                1,
            )

        self.assertEqual(
            events,
            ["check:aggregator", "check:aggregator", "check:aggregator-ui"],
        )
        fix.assert_called_once()
        tests.assert_called_once()
        secrets.assert_not_called()
        self.assertIn(
            "Testing aggregator.. SKIPPED (checks failed)", output.getvalue()
        )

    def test_qa_format_is_routed_to_its_own_orchestration_mode(self) -> None:
        with (
            patch.object(
                sys,
                "argv",
                ["code_qa", "qa-format", "--module", "catalog"],
            ),
            patch.object(main, "run_qa_command", return_value=0) as run,
        ):
            self.assertEqual(main.main(), 0)
        self.assertEqual(run.call_args.kwargs["modules"], ["catalog"])
        self.assertTrue(run.call_args.kwargs["format_before_tests"])

    def test_code_format_still_applies_fixes(self) -> None:
        with (
            patch.object(
                main,
                "_run_checks",
                side_effect=[(False, ["code-qa/ruff-format"]), (True, [])],
            ),
            patch.object(main, "execute_check", return_value=(True, [])) as fix,
            redirect_stdout(StringIO()),
        ):
            self.assertEqual(main.run_format_command(modules=["code-qa"]), 0)
        fix.assert_called_once()
        self.assertEqual(fix.call_args.args[0].check_id, "code-qa/ruff-format")
        self.assertEqual(fix.call_args.args[1], ["--format-fix"])

    def test_scoped_format_passes_the_same_files_to_each_fixer(self) -> None:
        root = main.repo_root()
        selected = root / "tools/code_qa/src/core/cli.py"
        changed = [selected]
        with (
            patch.object(main, "scoped_paths", return_value=changed),
            patch.object(main, "iter_repo_files") as all_files,
            patch.object(
                main,
                "_run_checks",
                side_effect=[(False, ["code-qa/ruff-format"]), (True, [])],
            ),
            patch.object(main, "execute_check", return_value=(True, [])) as fix,
            redirect_stdout(StringIO()),
        ):
            self.assertEqual(main.run_format_command(modules=["code-qa"]), 0)
        all_files.assert_not_called()
        self.assertEqual(fix.call_args.args[2:], (root, changed))
        self.assertTrue(fix.call_args.kwargs["scoped"])

    def test_code_format_tries_remaining_fixers_after_failure(self) -> None:
        with (
            patch.object(
                main,
                "_run_checks",
                side_effect=[
                    (False, ["code-qa/ruff-format", "code-qa/trailing-whitespace"]),
                    (False, ["code-qa/ruff-format"]),
                ],
            ) as checks,
            patch.object(
                main,
                "execute_check",
                side_effect=[
                    (False, ["Manual Ruff fix required"]),
                    (True, []),
                ],
            ) as fix,
            redirect_stdout(StringIO()) as output,
        ):
            self.assertEqual(main.run_format_command(modules=["code-qa"]), 1)

        self.assertEqual(checks.call_count, 2)
        self.assertEqual(
            [(call.args[0].runner, call.args[1]) for call in fix.call_args_list],
            [
                ("code_qa.src.checks.format.ruff", ["--format-fix"]),
                ("code_qa.src.checks.other.trailing_whitespace", ["--format"]),
            ],
        )
        self.assertIn("Manual Ruff fix required", output.getvalue())
        self.assertIn("=== QA: FAILED ===", output.getvalue())

    def test_ruff_checks_report_independent_results(self) -> None:
        ruff_checks = [
            check
            for check in main.CHECK_TEMPLATES
            if check.check_id.startswith("ruff-")
        ]
        output = StringIO()
        errors: list[str] = []
        with (
            patch.object(main, "CHECKS", ruff_checks),
            patch.object(
                main,
                "execute_check",
                side_effect=[
                    (True, ["All checks passed!"]),
                    (False, ["unformatted: File would be reformatted"]),
                ],
            ) as run,
            redirect_stdout(output),
        ):
            ok, failed = main._run_checks(errors.append)

        self.assertFalse(ok)
        self.assertEqual(failed, ["ruff-format"])
        self.assertEqual(
            [call.args[1] for call in run.call_args_list],
            [["--lint-check-only"], ["--format-check-only"]],
        )
        self.assertIn("  Checking ruff lint.. OK", output.getvalue())
        self.assertIn("  Checking ruff formatting.. FAILED", output.getvalue())
        self.assertNotIn("All checks passed!", errors)
        self.assertEqual(
            errors,
            [
                "  source: code_qa.src.checks.format.ruff",
                "  unformatted: File would be reformatted",
            ],
        )

    def test_code_format_only_fixes_the_failing_ruff_stage(self) -> None:
        with (
            patch.object(
                main,
                "_run_checks",
                side_effect=[(False, ["code-qa/ruff-lint"]), (True, [])],
            ),
            patch.object(main, "execute_check", return_value=(True, [])) as fix,
            redirect_stdout(StringIO()),
        ):
            self.assertEqual(main.run_format_command(modules=["code-qa"]), 0)

        fix.assert_called_once()
        self.assertEqual(fix.call_args.args[0].check_id, "code-qa/ruff-lint")
        self.assertEqual(fix.call_args.args[1], ["--lint-fix"])

    def test_code_format_finishes_each_module_before_starting_the_next(self) -> None:
        with (
            patch.object(
                main,
                "_run_checks",
                side_effect=[
                    (False, ["aggregator/java-format"]),
                    (True, []),
                    (False, ["aggregator-ui/prettier"]),
                    (True, []),
                ],
            ) as checks,
            patch.object(main, "execute_check", return_value=(True, [])) as fix,
            redirect_stdout(StringIO()),
        ):
            self.assertEqual(
                main.run_format_command(modules=["aggregator", "aggregator-ui"]), 0
            )

        self.assertEqual(
            [call.args[1] for call in checks.call_args_list],
            [["aggregator"], ["aggregator"], ["aggregator-ui"], ["aggregator-ui"]],
        )
        self.assertEqual(
            [call.args[0].check_id for call in fix.call_args_list],
            ["aggregator/java-format", "aggregator-ui/prettier"],
        )

    def test_code_format_stops_when_a_module_still_fails_after_formatting(self) -> None:
        with (
            patch.object(
                main,
                "_run_checks",
                side_effect=[
                    (False, ["aggregator/java-format"]),
                    (False, ["aggregator/java-format"]),
                ],
            ) as checks,
            patch.object(main, "execute_check", return_value=(True, [])),
            redirect_stdout(StringIO()),
        ):
            self.assertEqual(
                main.run_format_command(modules=["aggregator", "aggregator-ui"]), 1
            )

        self.assertEqual(
            [call.args[1] for call in checks.call_args_list],
            [["aggregator"], ["aggregator"]],
        )

    def test_run_module_keeps_every_failure_line(self) -> None:
        violations = [f"Ruff violation {index}" for index in range(25)]
        result = MagicMock(
            returncode=1,
            stdout="\n".join(violations),
            stderr="Additional diagnostics",
        )
        with patch.object(utils.subprocess, "run", return_value=result) as run:
            ok, details = utils.run_module(
                "code_qa.src.checks.format.ruff", ["--check-only"]
            )

        self.assertFalse(ok)
        self.assertEqual(details, [*violations, "Additional diagnostics"])
        self.assertTrue(run.call_args.kwargs["capture_output"])

    def test_checks_continue_and_print_all_failure_diagnostics(self) -> None:
        checks = [
            main.CheckSpec(
                "ruff",
                "ruff",
                "code_qa.src.checks.format.ruff",
                ["--check-only"],
                None,
                module="aggregator",
            ),
            main.CheckSpec(
                "prettier",
                "prettier",
                "code_qa.src.checks.format.prettier",
                ["--check-only"],
                None,
                module="aggregator-ui",
            ),
        ]
        violations = [f"Ruff violation {index}" for index in range(25)]
        output = StringIO()
        with (
            patch.object(main, "CHECKS", checks),
            patch.object(
                main,
                "execute_check",
                side_effect=[(False, violations), (False, ["Prettier violation"])],
            ) as run,
            redirect_stdout(output),
        ):
            ok, failed = main._run_checks(print)

        self.assertFalse(ok)
        self.assertEqual(failed, ["ruff", "prettier"])
        self.assertEqual(run.call_count, 2)
        self.assertIn("Module: aggregator\n  Checking ruff.. FAILED", output.getvalue())
        self.assertIn(
            "\nModule: aggregator-ui\n  Checking prettier.. FAILED", output.getvalue()
        )
        self.assertIn("Ruff violation 24", output.getvalue())
        self.assertIn("Prettier violation", output.getvalue())

    def test_emitter_flushes_console_messages(self) -> None:
        with patch("builtins.print") as print_message:
            emit, _, close = utils.build_emitter("")
            try:
                emit("Testing aggregator.. OK")
                emit("Testing catalog.. OK")
            finally:
                close()

        self.assertEqual(print_message.call_count, 2)
        print_message.assert_any_call("Testing aggregator.. OK", flush=True)
        print_message.assert_any_call("Testing catalog.. OK", flush=True)

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
            self.assertEqual(
                main.run_test_command(modules=["catalog"], verbose=True), 0
            )
        self.assertIn("Starting tests", output.getvalue())
        self.assertIn("two passed", output.getvalue())
        self.assertIn("=== QA: PASSED ===", output.getvalue())
        command = popen.call_args.args[0]
        self.assertIn("code_qa.src.checks.tests.go_tests", command)
        self.assertEqual(
            command[command.index("--directory") + 1],
            str(main.repo_root() / main.MODULE_BY_NAME["catalog"].path),
        )
        self.assertNotIn("--module", command)

    def test_test_output_replaces_unicode_status_symbols(self) -> None:
        process = MagicMock()
        process.stdout = iter(
            [
                "✓ sample.test.tsx > passes\n",
                "✗ sample.test.tsx > fails\n",
                "❯ sample.test.tsx > nested case\n",
            ]
        )
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
        self.assertEqual(popen.call_args.kwargs["env"]["PYTHONIOENCODING"], "utf-8")

    def test_success_output_is_hidden_in_compact_mode(self) -> None:
        process = MagicMock()
        process.stdout = iter(["successful test detail\n"])
        process.wait.return_value = 0
        process.__enter__.return_value = process
        with (
            patch.object(main.subprocess, "Popen", return_value=process),
            redirect_stdout(StringIO()) as output,
        ):
            self.assertEqual(main.run_test_command(modules=["catalog"]), 0)
        self.assertIn("Testing catalog.. OK", output.getvalue())
        self.assertNotIn("successful test detail", output.getvalue())

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
                patch.object(
                    sys,
                    "argv",
                    [
                        "code_qa.src.core.cli",
                        "test",
                        "--module",
                        "catalog",
                        "--verbose",
                    ],
                ),
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
            self.assertEqual(main.run_test_command(modules=["catalog"]), 1)
        self.assertIn("Unable to start test command", output.getvalue())

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
        self.assertIn("--verbose", popen.call_args.args[0])
        self.assertIn("code_qa.src.checks.tests.go_tests", popen.call_args.args[0])


if __name__ == "__main__":
    unittest.main()
