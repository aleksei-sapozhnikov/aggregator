"""Check Lambda ZIP layout and the configured runtime package name."""

from __future__ import annotations

import importlib
import io
import sys
import tempfile
import unittest
import zipfile
from contextlib import redirect_stdout
from pathlib import Path
from unittest.mock import patch

from lambda_fixtures import write_source

SOURCE_TOOLS = Path(__file__).resolve().parent.parent / "src"
sys.path.insert(0, str(SOURCE_TOOLS))

import build_lambda_zip


class LambdaPackageLayoutTests(unittest.TestCase):
    def test_builder_keeps_the_configured_runtime_package_name(self):
        with tempfile.TemporaryDirectory() as temporary_directory:
            package_path = Path(temporary_directory) / "candidate.zip"
            source = write_source(Path(temporary_directory) / "source")
            stdout = io.StringIO()
            arguments = [
                "build_lambda_zip.py",
                "--source",
                str(source),
                "--output",
                str(package_path),
            ]
            with (
                patch.object(sys, "argv", arguments),
                redirect_stdout(stdout),
            ):
                build_lambda_zip.main()

            with zipfile.ZipFile(package_path) as archive:
                names = set(archive.namelist())
            with patch.object(sys, "path", [str(package_path), *sys.path]):
                handler = importlib.import_module("github_publication_runner.handler")
                self.assertTrue(callable(handler.lambda_handler))
            for module_name in tuple(sys.modules):
                if module_name == "github_publication_runner" or module_name.startswith(
                    "github_publication_runner."
                ):
                    del sys.modules[module_name]

        self.assertIn("github_publication_runner/handler.py", names)
        self.assertIn("github_publication_runner/github/github_client.py", names)
        self.assertIn("github_publication_runner/publication/snapshot_runner.py", names)
        self.assertFalse(any(name.startswith("lambda_publisher/") for name in names))


if __name__ == "__main__":
    unittest.main()
