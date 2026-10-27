"""Verify the YAML syntax check accepts multi-document Kubernetes manifests."""

from __future__ import annotations

import tempfile
import unittest
from contextlib import redirect_stdout
from io import StringIO
from pathlib import Path
from unittest.mock import patch

from code_qa.src.checks.other import yaml_files
from code_qa.src.core.inputs import FileInputs


class YamlFilesTests(unittest.TestCase):
    def run_check(self, content: str) -> tuple[int, str]:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            manifest = root / "manifest.yaml"
            manifest.write_text(content, encoding="utf-8")
            output = StringIO()
            with (
                patch.object(
                    yaml_files,
                    "parse_file_inputs",
                    return_value=FileInputs(root=root, files=[manifest]),
                ),
                patch.dict(
                    yaml_files.os.environ,
                    {yaml_files.BOOTSTRAP_ENV: "1"},
                ),
                redirect_stdout(output),
            ):
                result = yaml_files.main()
        return result, output.getvalue()

    def test_single_yaml_document(self) -> None:
        result, output = self.run_check("name: catalog\\n")
        self.assertEqual(result, 0)
        self.assertEqual(output, "")

    def test_multiple_yaml_documents(self) -> None:
        result, output = self.run_check(
            "apiVersion: apps/v1\\nkind: Deployment\\n"
            "---\\napiVersion: v1\\nkind: Service\\n"
        )
        self.assertEqual(result, 0)
        self.assertEqual(output, "")

    def test_invalid_second_document_is_reported(self) -> None:
        result, output = self.run_check(
            "apiVersion: v1\\nkind: Service\\n"
            "---\\nmetadata: [unterminated\\n"
        )
        self.assertEqual(result, 1)
        self.assertIn("manifest.yaml", output)


if __name__ == "__main__":
    unittest.main()
