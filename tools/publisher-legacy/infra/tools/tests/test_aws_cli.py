"""Check AWS CLI error redaction without network calls."""

from __future__ import annotations

import subprocess
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

SOURCE_TOOLS = Path(__file__).resolve().parent.parent / "src"
sys.path.insert(0, str(SOURCE_TOOLS))

import aws_cli


class AwsCliRedactionTests(unittest.TestCase):
    def test_cli_errors_do_not_retain_raw_response_text(self):
        sensitive_text = "An error occurred (AccessDenied) for private@example.com"
        result = subprocess.CompletedProcess(
            args=["aws"], returncode=255, stdout="", stderr=sensitive_text
        )
        with (
            patch("aws_cli.shutil.which", return_value="aws"),
            patch("aws_cli.subprocess.run", return_value=result),
            self.assertRaises(aws_cli.AwsCliError) as caught,
        ):
            aws_cli.aws_output(
                "aggregator-admin",
                "eu-central-1",
                "sns",
                "get-topic-attributes",
                "--topic-arn",
                "arn:example",
            )

        self.assertIn("AccessDenied", str(caught.exception))
        self.assertNotIn("private@example.com", str(caught.exception))


if __name__ == "__main__":
    unittest.main()
