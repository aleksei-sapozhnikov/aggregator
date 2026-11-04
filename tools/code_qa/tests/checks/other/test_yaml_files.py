"""Verify YAML validation handles all documents without test environment dependencies."""

from __future__ import annotations

import sys
import tempfile
import unittest
from contextlib import redirect_stdout
from io import StringIO
from pathlib import Path
from types import ModuleType
from unittest.mock import patch

from code_qa.src.checks.other import yaml_files
from code_qa.src.core.inputs import FileInputs


class YamlFilesTests(unittest.TestCase):
    def run_check(
        self,
        content: str,
        *,
        document_count: int = 1,
        invalid_document_index: int | None = None,
    ) -> tuple[int, str, list[int]]:
        """Simulate PyYAML to test document iteration without requiring its installation."""

        class FakeYAMLError(Exception):
            pass

        parsed_documents: list[int] = []

        def safe_load_all(source: str):
            self.assertEqual(source, content)
            for index in range(document_count):
                parsed_documents.append(index)
                if index == invalid_document_index:
                    raise FakeYAMLError("invalid YAML document")
                yield {"index": index}

        fake_yaml = ModuleType("yaml")
        fake_yaml.YAMLError = FakeYAMLError
        fake_yaml.safe_load_all = safe_load_all

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
                patch.dict(sys.modules, {"yaml": fake_yaml}),
                patch.dict(
                    yaml_files.os.environ,
                    {yaml_files.BOOTSTRAP_ENV: "1"},
                ),
                redirect_stdout(output),
            ):
                result = yaml_files.main()
        return result, output.getvalue(), parsed_documents

    def test_single_yaml_document(self) -> None:
        result, output, parsed = self.run_check("name: catalog\n")
        self.assertEqual(result, 0)
        self.assertEqual(output, "")
        self.assertEqual(parsed, [0])

    def test_multiple_yaml_documents(self) -> None:
        result, output, parsed = self.run_check(
            "apiVersion: apps/v1\nkind: Deployment\n"
            "---\napiVersion: v1\nkind: Service\n",
            document_count=2,
        )
        self.assertEqual(result, 0)
        self.assertEqual(output, "")
        self.assertEqual(parsed, [0, 1])

    def test_invalid_second_document_is_reported(self) -> None:
        result, output, parsed = self.run_check(
            "apiVersion: v1\nkind: Service\n---\nmetadata: [unterminated\n",
            document_count=2,
            invalid_document_index=1,
        )
        self.assertEqual(result, 1)
        self.assertEqual(parsed, [0, 1])
        self.assertIn("manifest.yaml", output)
        self.assertIn("invalid YAML document", output)


if __name__ == "__main__":
    unittest.main()
