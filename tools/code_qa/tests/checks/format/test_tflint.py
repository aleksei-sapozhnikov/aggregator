"""Verify TFLint policy, caches, and hook scope."""

from __future__ import annotations

import json
import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from code_qa.src.checks.format import tflint


class TFLintTests(unittest.TestCase):
    def setUp(self) -> None:
        self.workspace = Path(tempfile.gettempdir()).resolve() / "qa-tflint-workspace"
        self.directory = self.workspace / "infra"
        self.cache = tempfile.TemporaryDirectory()
        self.addCleanup(self.cache.cleanup)

    def test_loads_shared_policy_and_fails_on_notice_level_issues(self) -> None:
        with (
            patch.object(tflint, "runtime_dir", return_value=Path(self.cache.name)),
            patch.object(tflint, "resolve", return_value="tflint"),
            patch.object(
                tflint.subprocess,
                "run",
                return_value=subprocess.CompletedProcess([], 0),
            ) as run,
        ):
            self.assertEqual(tflint.run(self.directory, self.workspace), 0)
        config = f"--config={self.workspace / '.tflint.hcl'}"
        self.assertEqual(run.call_args_list[0].args[0], ["tflint", "--init", config])
        self.assertEqual(
            run.call_args_list[1].args[0],
            [
                "tflint",
                "--recursive",
                config,
                "--format=compact",
                "--minimum-failure-severity=notice",
                "--no-color",
            ],
        )
        self.assertEqual(
            run.call_args.kwargs["env"]["TFLINT_PLUGIN_DIR"],
            str(Path(self.cache.name) / "tflint/plugins"),
        )
        self.assertEqual(
            run.call_args.kwargs["env"]["TFLINT_DISABLE_VERSION_CHECK"], "1"
        )

    def test_hook_scope_skips_docs_and_keeps_deleted_hcl_files(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            manifest = Path(temporary) / "changed.json"
            manifest.write_text(json.dumps(["infra/README.md"]), encoding="utf-8")
            with patch.object(tflint, "resolve") as resolve:
                self.assertEqual(
                    tflint.run(self.directory, self.workspace, manifest), 0
                )
            resolve.assert_not_called()
            manifest.write_text(json.dumps(["infra/deleted.hcl"]), encoding="utf-8")
            with patch.object(tflint, "resolve", return_value=None) as resolve:
                self.assertEqual(
                    tflint.run(self.directory, self.workspace, manifest), 1
                )
            resolve.assert_called_once_with(self.workspace)

    def test_shared_policy_change_runs_in_scoped_mode(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            manifest = Path(temporary) / "changed.json"
            manifest.write_text(json.dumps([".tflint.hcl"]), encoding="utf-8")
            with (
                patch.object(tflint, "runtime_dir", return_value=Path(self.cache.name)),
                patch.object(tflint, "resolve", return_value="tflint"),
                patch.object(
                    tflint.subprocess,
                    "run",
                    return_value=subprocess.CompletedProcess([], 0),
                ) as execute,
            ):
                self.assertEqual(
                    tflint.run(self.directory, self.workspace, manifest), 0
                )
            self.assertEqual(execute.call_count, 2)

    def test_lint_failure_is_returned(self) -> None:
        with (
            patch.object(tflint, "runtime_dir", return_value=Path(self.cache.name)),
            patch.object(tflint, "resolve", return_value="tflint"),
            patch.object(
                tflint.subprocess,
                "run",
                side_effect=[
                    subprocess.CompletedProcess([], 0),
                    subprocess.CompletedProcess([], 2),
                ],
            ),
        ):
            self.assertEqual(tflint.run(self.directory, self.workspace), 2)


if __name__ == "__main__":
    unittest.main()
