"""Test redaction and timestamp parsing used by local publication tools.

These unit tests exercise helper functions only; they do not invoke AWS or
modify publication resources.
"""

from __future__ import annotations

import json
import io
import importlib
import subprocess
import sys
import tempfile
import unittest
import zipfile
from contextlib import redirect_stdout
from pathlib import Path
from unittest.mock import patch


SOURCE_TOOLS = Path(__file__).resolve().parents[2] / "src" / "tools"
sys.path.insert(0, str(SOURCE_TOOLS))

import aws_cli
import build_lambda_zip
from inspect_publication_notifications import policy_summary
from inspect_watchdog_runtime import parse_utc_timestamp, safe_error_type


class AwsCliRedactionTests(unittest.TestCase):
    def test_cli_errors_do_not_retain_raw_response_text(self):
        sensitive_text = "An error occurred (AccessDenied) for private@example.com"
        result = subprocess.CompletedProcess(args=["aws"], returncode=255, stdout="", stderr=sensitive_text)
        with patch("aws_cli.shutil.which", return_value="aws"), patch(
            "aws_cli.subprocess.run", return_value=result
        ):
            with self.assertRaises(aws_cli.AwsCliError) as caught:
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


class LambdaPackageLayoutTests(unittest.TestCase):
    def test_builder_keeps_the_configured_runtime_package_name(self):
        with tempfile.TemporaryDirectory() as temporary_directory:
            package_path = Path(temporary_directory) / "candidate.zip"
            stdout = io.StringIO()
            with patch.object(sys, "argv", ["build_lambda_zip.py", "--output", str(package_path)]):
                with redirect_stdout(stdout):
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


class NotificationSummaryTests(unittest.TestCase):
    def test_policy_summary_omits_unrelated_endpoint_fields(self):
        endpoint = "private@example.com"
        document = {
            "Endpoint": endpoint,
            "Statement": {
                "Sid": "PublishFailures",
                "Effect": "Allow",
                "Action": "sns:Publish",
                "Resource": "arn:aws:sns:eu-central-1:905418096305:topic",
            },
        }

        summary = policy_summary(document)

        self.assertEqual(summary[0]["actions"], ["sns:Publish"])
        self.assertNotIn(endpoint, json.dumps(summary))


class WatchdogSummaryTests(unittest.TestCase):
    def test_utc_timestamp_is_normalized(self):
        parsed = parse_utc_timestamp("2026-10-26T03:06:00Z")
        self.assertEqual(parsed.isoformat(), "2026-10-26T03:06:00+00:00")

    def test_non_utc_offset_is_rejected(self):
        with self.assertRaisesRegex(ValueError, "UTC offset"):
            parse_utc_timestamp("2026-10-26T06:06:00+03:00")

    def test_error_summary_contains_only_exception_type(self):
        entry = {"reason": "request failed (AccessDenied): private@example.com"}
        self.assertEqual(safe_error_type(entry), "AccessDenied")


if __name__ == "__main__":
    unittest.main()
