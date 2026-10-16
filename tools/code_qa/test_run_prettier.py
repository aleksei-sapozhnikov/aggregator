"""Regression tests for bounded Prettier subprocess argument lists."""

from __future__ import annotations

import subprocess
import unittest
from contextlib import redirect_stderr, redirect_stdout
from io import StringIO
from pathlib import Path
from unittest.mock import patch

import run_prettier


class PrettierBatchTests(unittest.TestCase):
    """Exercise command splitting without requiring Node.js or Prettier."""

    def test_batches_fit_the_command_limit_and_preserve_file_order(self) -> None:
        command = [r"C:\repo\.temp\qa-runtime\node_modules\.bin\prettier.cmd", "--check"]
        files = [f"services-core/example/src/subdirectory/filename-{i:04d}.tsx" for i in range(500)]
        batches = list(run_prettier.batched_file_args(command, files))
        self.assertGreater(len(batches), 1)
        self.assertEqual([item for batch in batches for item in batch], files)
        for batch in batches:
            length = sum(len(arg) + 3 for arg in [*command, *batch])
            self.assertLessEqual(length, run_prettier.MAX_COMMAND_LENGTH)

    def test_short_commands_run_as_a_single_batch(self) -> None:
        self.assertEqual(
            list(run_prettier.batched_file_args(["prettier", "--write"], ["a.ts", "b.ts"])),
            [["a.ts", "b.ts"]],
        )

    def test_run_prettier_processes_all_batches_and_reports_failure(self) -> None:
        command = ["prettier", "--write"]
        files = [f"long-folder/file-{i:04d}-" + "x" * 180 + ".tsx" for i in range(100)]
        expected_batches = list(run_prettier.batched_file_args(command, files))
        self.assertGreater(len(expected_batches), 1)
        results = [subprocess.CompletedProcess([], 0) for _ in expected_batches]
        results[1] = subprocess.CompletedProcess([], 2)

        with (
            patch.object(run_prettier, "repo_root", return_value=Path("/repo")),
            patch.object(run_prettier.subprocess, "run", side_effect=results) as execute,
        ):
            self.assertEqual(run_prettier.run_prettier(command, files), 2)

        self.assertEqual(execute.call_count, len(expected_batches))
        for call, batch in zip(execute.call_args_list, expected_batches):
            self.assertEqual(call.args[0], [*command, *batch])
            self.assertEqual(call.kwargs["cwd"], Path("/repo"))
            self.assertIs(call.kwargs["check"], False)
            self.assertIs(call.kwargs["capture_output"], True)
            self.assertIs(call.kwargs["text"], True)

    def test_check_output_hides_repeated_batch_banners_but_keeps_warnings(self) -> None:
        command = ["prettier", "--check"]
        files = [f"long/path/file-{i:04d}-" + "x" * 180 + ".tsx" for i in range(100)]
        batches = list(run_prettier.batched_file_args(command, files))
        responses = [
            subprocess.CompletedProcess(
                [], 0,
                stdout="Checking formatting...\\nAll matched files use Prettier code style!\\n",
                stderr="",
            )
            for _ in batches
        ]
        responses[1] = subprocess.CompletedProcess(
            [], 1,
            stdout="Checking formatting...\\n",
            stderr="[warn] src/unformatted.ts\\n[warn] Code style issues found.\\n",
        )
        stdout, stderr = StringIO(), StringIO()
        with (
            patch.object(run_prettier, "repo_root", return_value=Path("/repo")),
            patch.object(run_prettier.subprocess, "run", side_effect=responses),
            redirect_stdout(stdout),
            redirect_stderr(stderr),
        ):
            self.assertEqual(run_prettier.run_prettier(command, files), 1)

        combined = stdout.getvalue() + stderr.getvalue()
        self.assertNotIn("Checking formatting...", combined)
        self.assertNotIn("All matched files use Prettier code style!", combined)
        self.assertIn("[warn] src/unformatted.ts", combined)
        self.assertIn("[warn] Code style issues found.", combined)

    def test_format_output_keeps_filenames_but_removes_per_batch_banners(self) -> None:
        command = ["prettier", "--write"]
        files = ["a.ts", "b.ts"]
        stdout = StringIO()
        with (
            patch.object(run_prettier, "repo_root", return_value=Path("/repo")),
            patch.object(
                run_prettier.subprocess,
                "run",
                return_value=subprocess.CompletedProcess(
                    [], 0, stdout="Formatting...\\na.ts 10ms\\nb.ts 20ms\\n", stderr="",
                ),
            ),
            redirect_stdout(stdout),
        ):
            self.assertEqual(run_prettier.run_prettier(command, files), 0)

        self.assertEqual(stdout.getvalue().splitlines(), ["a.ts 10ms", "b.ts 20ms"])

    def test_overlong_single_file_reports_a_clear_error(self) -> None:
        with self.assertRaisesRegex(ValueError, "File path is too long"):
            list(run_prettier.batched_file_args(["prettier", "--check"], ["x" * 4_000]))


if __name__ == "__main__":
    unittest.main()
