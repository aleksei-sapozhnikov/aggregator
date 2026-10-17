"""Tests for the read-only Ruff checks and explicit formatting mode."""

from __future__ import annotations

import subprocess
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

import run_ruff


class RuffRunnerTests(unittest.TestCase):
    """Verify that QA never invokes Ruff's mutating commands."""

    def run_ruff_mode(
        self, flag: str, return_codes: list[int]
    ) -> tuple[int, list[list[str]]]:
        root = Path("/repo")
        results = [
            subprocess.CompletedProcess([], return_code) for return_code in return_codes
        ]
        with (
            patch.object(sys, "argv", ["run_ruff.py", flag]),
            patch.object(run_ruff, "resolve_ruff_cmd", return_value=["ruff"]),
            patch.object(run_ruff, "repo_root", return_value=root),
            patch.object(
                run_ruff, "iter_repo_files", return_value=[root / "module.py"]
            ),
            patch.object(run_ruff.subprocess, "run", side_effect=results) as run,
        ):
            result = run_ruff.main()
        return result, [call.args[0] for call in run.call_args_list]

    def test_check_only_runs_both_checks_without_modifying_files(self) -> None:
        result, commands = self.run_ruff_mode("--check-only", [0, 0])
        self.assertEqual(result, 0)
        self.assertEqual(
            commands,
            [
                ["ruff", "check", "--no-fix", "module.py"],
                ["ruff", "format", "--check", "module.py"],
            ],
        )

    def test_check_only_reports_either_failure(self) -> None:
        for lint_rc, format_rc in ((1, 0), (0, 1), (1, 1)):
            with self.subTest(lint_rc=lint_rc, format_rc=format_rc):
                result, commands = self.run_ruff_mode(
                    "--check-only", [lint_rc, format_rc]
                )
                self.assertEqual(result, 1)
                self.assertEqual(len(commands), 2)
                self.assertIn("--no-fix", commands[0])
                self.assertIn("--check", commands[1])

    def test_format_mode_is_the_only_mode_that_applies_fixes(self) -> None:
        result, commands = self.run_ruff_mode("--format", [0, 0])
        self.assertEqual(result, 0)
        self.assertEqual(
            commands,
            [
                ["ruff", "check", "--fix", "module.py"],
                ["ruff", "format", "module.py"],
            ],
        )

    def test_format_mode_stops_if_lint_fixes_fail(self) -> None:
        result, commands = self.run_ruff_mode("--format", [1])
        self.assertEqual(result, 1)
        self.assertEqual(commands, [["ruff", "check", "--fix", "module.py"]])


if __name__ == "__main__":
    unittest.main()
