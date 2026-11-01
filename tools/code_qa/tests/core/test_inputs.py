"""Verify manifest inputs are explicit and independent of caller environment."""

import argparse
import json
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from code_qa.src.core.inputs import file_inputs


class FileInputTests(unittest.TestCase):
    def test_reads_only_the_manifest_ignoring_hook_or_module_environment(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary).resolve()
            selected, unselected = root / "chosen.py", root / "other.py"
            selected.touch()
            unselected.touch()
            manifest = root / "files.json"
            manifest.write_text(
                json.dumps(["chosen.py", "deleted.py"]), encoding="utf-8"
            )
            with patch.dict(
                os.environ,
                {
                    "CODE_QA_MODULE": "unrelated",
                    "CODE_QA_FILE_LIST": "missing-hook-scope",
                },
            ):
                inputs = file_inputs(argparse.Namespace(root=root, files_from=manifest))
            self.assertEqual(inputs.root, root)
            self.assertEqual(inputs.files, [selected])

    def test_rejects_paths_outside_the_supplied_root(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            manifest = root / "files.json"
            manifest.write_text(json.dumps(["../outside.py"]), encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "outside"):
                file_inputs(argparse.Namespace(root=root, files_from=manifest))

    def test_rejects_a_non_list_manifest(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            manifest = root / "files.json"
            manifest.write_text("{}", encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "array of paths"):
                file_inputs(argparse.Namespace(root=root, files_from=manifest))
