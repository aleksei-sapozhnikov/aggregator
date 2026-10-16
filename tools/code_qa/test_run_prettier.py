"""Regression tests for bounded Prettier subprocess argument lists."""

from __future__ import annotations

import subprocess
import unittest
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

    def test_overlong_single_file_reports_a_clear_error(self) -> None:
        with self.assertRaisesRegex(ValueError, "File path is too long"):
            list(run_prettier.batched_file_args(["prettier", "--check"], ["x" * 4_000]))


if __name__ == "__main__":
    unittest.main()
