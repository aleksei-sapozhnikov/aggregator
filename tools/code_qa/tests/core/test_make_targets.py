"""Contract tests for the public GNU Make QA shortcuts."""

from __future__ import annotations

import os
import shutil
import subprocess
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[4]


@unittest.skipUnless(shutil.which("make"), "GNU Make is not installed")
class MakeQATargetTests(unittest.TestCase):
    def dry_run(self, *arguments: str) -> str:
        """Expand a Make command without running formatters, tests, or secrets."""
        # Recursive Make exports CLI variables into the QA subprocess.
        # A nested dry run must not inherit the parent module or scan flags.
        env = os.environ.copy()
        for name in (
            "MODULE",
            "QA_SCAN_SECRETS",
            "MAKEFLAGS",
            "MFLAGS",
            "MAKEOVERRIDES",
            "MAKELEVEL",
            "GNUMAKEFLAGS",
        ):
            env.pop(name, None)
        result = subprocess.run(
            ["make", "--no-print-directory", "-n", *arguments],
            cwd=ROOT,
            env=env,
            capture_output=True,
            text=True,
            check=False,
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        return result.stdout

    def test_qa_format_accepts_multiple_positional_modules(self) -> None:
        output = self.dry_run("qa-format", "aggregator", "aggregator-ui")
        self.assertIn("src/main.py qa-format", output)
        self.assertIn("--module aggregator --module aggregator-ui", output)
        self.assertNotIn("--skip-secrets", output)
        self.assertNotIn("docker compose", output)

    def test_qa_check_accepts_multiple_positional_modules(self) -> None:
        output = self.dry_run("qa-check", "demo", "shared")
        self.assertIn("src/main.py qa-check", output)
        self.assertIn("--module demo --module shared", output)

    def test_qa_check_preserves_ci_module_and_secrets_options(self) -> None:
        output = self.dry_run("qa-check", "MODULE=demo", "QA_SCAN_SECRETS=false")
        self.assertIn("src/main.py qa-check --skip-secrets --module demo", output)

    def test_code_qa_is_only_a_positional_module(self) -> None:
        output = self.dry_run("qa-format", "shared", "code-qa", "publisher")
        self.assertIn(
            "src/main.py qa-format --module shared --module code-qa --module publisher",
            output,
        )
        self.assertNotIn("src/main.py code-qa", output)

    def test_qa_secrets_runs_without_module_checks(self) -> None:
        output = self.dry_run("qa-secrets")
        self.assertIn("src/main.py qa-secrets", output)
        self.assertNotIn("--module", output)
        self.assertNotIn("--skip-secrets", output)

    def test_qa_check_without_modules_scans_every_module(self) -> None:
        output = self.dry_run("qa-check")
        self.assertIn("src/main.py qa-check", output)
        self.assertNotIn("--module", output)
        self.assertNotIn("--skip-secrets", output)


if __name__ == "__main__":
    unittest.main()
