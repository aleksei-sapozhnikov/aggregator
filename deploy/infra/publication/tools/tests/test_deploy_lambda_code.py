"""Check reproducible code-release packaging after moving the tools."""

from __future__ import annotations

import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

from lambda_fixtures import write_source


SOURCE_TOOLS = Path(__file__).resolve().parent.parent / "src"


class LambdaCodeDeploymentTests(unittest.TestCase):
    def test_relocated_tools_build_reproducibly_from_an_unrelated_directory(self):
        with tempfile.TemporaryDirectory() as temporary_directory:
            outside = Path(temporary_directory)
            module = outside / "standalone"
            shutil.copytree(
                SOURCE_TOOLS.parent,
                module,
                ignore=shutil.ignore_patterns("__pycache__"),
            )
            source = write_source(outside / "runtime_source")
            package = outside / "artifacts" / "candidate.zip"

            subprocess.run(
                [
                    sys.executable, "-B", str(module / "src" / "build_lambda_zip.py"),
                    "--source", str(source), "--output", str(package),
                ],
                cwd=outside,
                check=True,
                capture_output=True,
            )
            first_build = package.read_bytes()
            subprocess.run(
                [
                    sys.executable,
                    "-B",
                    "-c",
                    "import sys; from pathlib import Path; sys.path.insert(0, sys.argv[1]); "
                    "import deploy_lambda_code; "
                    "deploy_lambda_code.run_builder(Path(sys.argv[2]), Path(sys.argv[3]))",
                    str(module / "src"), str(source), str(package),
                ],
                cwd=outside,
                check=True,
                capture_output=True,
            )
            self.assertEqual(first_build, package.read_bytes())
            self.assertTrue(package.with_suffix(".zip.sha256").is_file())
            self.assertTrue(package.with_suffix(".zip.manifest.json").is_file())
            self.assertFalse((outside / "build").exists())


if __name__ == "__main__":
    unittest.main()
