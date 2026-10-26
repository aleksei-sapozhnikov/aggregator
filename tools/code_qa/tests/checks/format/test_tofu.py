"""Verify isolated OpenTofu checks and hook scope."""

from __future__ import annotations

import json
import os
import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from code_qa.src.checks.format import tofu


class OpenTofuTests(unittest.TestCase):
    def setUp(self) -> None:
        self.workspace = Path(tempfile.gettempdir()).resolve() / "qa-tofu-workspace"
        self.directory = self.workspace / "infra"
        self.cache = tempfile.TemporaryDirectory()
        self.addCleanup(self.cache.cleanup)

    def test_validation_uses_readonly_lock_and_private_backend_data(self) -> None:
        original_data_dir = os.environ.get("TF_DATA_DIR")
        with (
            patch.object(tofu, "runtime_dir", return_value=Path(self.cache.name)),
            patch.object(tofu, "resolve", return_value="tofu"),
            patch.object(
                tofu.subprocess, "run", return_value=subprocess.CompletedProcess([], 0)
            ) as run,
            patch.dict(os.environ, {"TF_DATA_DIR": "deployment-data"}),
        ):
            self.assertEqual(tofu.run(self.directory, self.workspace, "validate"), 0)
        self.assertEqual(
            run.call_args_list[0].args[0],
            [
                "tofu",
                "init",
                "-backend=false",
                "-lockfile=readonly",
                "-input=false",
                "-no-color",
            ],
        )
        self.assertEqual(
            run.call_args_list[1].args[0], ["tofu", "validate", "-no-color"]
        )
        for call in run.call_args_list:
            self.assertEqual(call.kwargs["cwd"], self.directory)
            self.assertNotEqual(call.kwargs["env"]["TF_DATA_DIR"], "deployment-data")
            self.assertEqual(
                call.kwargs["env"]["TF_PLUGIN_CACHE_DIR"],
                str(Path(self.cache.name) / "tofu/providers"),
            )
        self.assertEqual(os.environ.get("TF_DATA_DIR"), original_data_dir)

    def test_format_checks_recursive_files_and_propagates_failures(self) -> None:
        with (
            patch.object(tofu, "runtime_dir", return_value=Path(self.cache.name)),
            patch.object(tofu, "resolve", return_value="tofu"),
            patch.object(
                tofu.subprocess, "run", return_value=subprocess.CompletedProcess([], 2)
            ) as run,
        ):
            self.assertEqual(tofu.run(self.directory, self.workspace, "check"), 2)
        self.assertEqual(
            run.call_args.args[0], ["tofu", "fmt", "-recursive", "-check", "-diff"]
        )

    def test_hook_scope_skips_docs_and_keeps_deleted_tf_files(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            manifest = Path(temporary) / "changed.json"
            manifest.write_text(json.dumps(["infra/README.md"]), encoding="utf-8")
            with patch.object(tofu, "resolve") as resolve:
                self.assertEqual(
                    tofu.run(self.directory, self.workspace, "check", manifest), 0
                )
            resolve.assert_not_called()
            manifest.write_text(json.dumps(["infra/deleted.tf"]), encoding="utf-8")
            with patch.object(tofu, "resolve", return_value=None) as resolve:
                self.assertEqual(
                    tofu.run(self.directory, self.workspace, "check", manifest), 1
                )
            resolve.assert_called_once_with(self.workspace)

    def test_scoped_format_explicitly_formats_the_entire_infra_root(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            manifest = Path(temporary) / "changed.json"
            manifest.write_text(json.dumps(["infra/main.tf"]), encoding="utf-8")
            with (
                patch.object(tofu, "runtime_dir", return_value=Path(self.cache.name)),
                patch.object(tofu, "resolve", return_value="tofu"),
                patch.object(
                    tofu.subprocess,
                    "run",
                    return_value=subprocess.CompletedProcess([], 0),
                ) as run,
            ):
                self.assertEqual(
                    tofu.run(self.directory, self.workspace, "format", manifest), 0
                )
            self.assertEqual(
                run.call_args.args[0], ["tofu", "fmt", "-recursive"]
            )

    def test_initialization_failure_stops_validation(self) -> None:
        with (
            patch.object(tofu, "runtime_dir", return_value=Path(self.cache.name)),
            patch.object(tofu, "resolve", return_value="tofu"),
            patch.object(
                tofu.subprocess, "run", return_value=subprocess.CompletedProcess([], 1)
            ) as run,
        ):
            self.assertEqual(tofu.run(self.directory, self.workspace, "validate"), 1)
        run.assert_called_once()


if __name__ == "__main__":
    unittest.main()
