"""Check credential selection and secret-read failures without AWS calls."""

import contextlib
import io
import os
import sys
import types
import unittest
from pathlib import Path
from unittest.mock import patch

SOURCE_ROOT = Path(__file__).resolve().parents[2] / "src"
sys.path.insert(0, str(SOURCE_ROOT))

from lambda_publisher.handler import _github_tokens, lambda_handler


class FakeSecretsManager:
    def __init__(self, values):
        self.values = values
        self.requested = []

    def get_secret_value(self, *, SecretId):
        self.requested.append(SecretId)
        return {"SecretString": self.values[SecretId]}


class UnavailableSecretsManager:
    def get_secret_value(self, *, SecretId):
        raise RuntimeError("Secrets Manager unavailable")


class GithubTokenSourceTests(unittest.TestCase):
    def test_secret_arns_take_precedence_over_legacy_environment_values(self):
        client = FakeSecretsManager(
            {
                "github-secret-arn": "stored-repository-token",
                "project-secret-arn": "stored-project-token",
            }
        )
        fake_boto3 = types.SimpleNamespace(client=lambda service: client)
        environment = {
            "GITHUB_SECRET_ARN": "github-secret-arn",
            "PROJECT_SECRET_ARN": "project-secret-arn",
            "GITHUB_TOKEN": "legacy-repository-token",
            "PROJECT_TOKEN": "legacy-project-token",
        }

        with (
            patch.dict(os.environ, environment, clear=True),
            patch.dict(sys.modules, {"boto3": fake_boto3}),
        ):
            self.assertEqual(
                _github_tokens(), ("stored-repository-token", "stored-project-token")
            )

        self.assertEqual(client.requested, ["github-secret-arn", "project-secret-arn"])

    def test_secret_read_failure_does_not_fall_back_to_legacy_tokens(self):
        fake_boto3 = types.SimpleNamespace(
            client=lambda service: UnavailableSecretsManager()
        )
        environment = {
            "GITHUB_SECRET_ARN": "github-secret-arn",
            "GITHUB_TOKEN": "legacy-repository-token",
            "PROJECT_TOKEN": "legacy-project-token",
        }

        with (
            patch.dict(os.environ, environment, clear=True),
            patch.dict(sys.modules, {"boto3": fake_boto3}),
            self.assertRaisesRegex(RuntimeError, "Secrets Manager unavailable"),
        ):
            _github_tokens()

    def test_legacy_environment_is_used_only_when_secret_arns_are_absent(self):
        environment = {
            "GITHUB_TOKEN": "legacy-repository-token",
            "PROJECT_TOKEN": "legacy-project-token",
        }

        with patch.dict(os.environ, environment, clear=True):
            self.assertEqual(
                _github_tokens(), ("legacy-repository-token", "legacy-project-token")
            )

    def test_expected_bootstrap_failure_redacts_secret_from_logs(self):
        secret = "ghp_" + "x" * 32
        event = {
            "event_id": "publisher-001-open",
            "data_revision": "a" * 64,
            "schedule_sha256": "b" * 64,
        }
        with (
            patch.dict(os.environ, {"NOTIFICATIONS_ENABLED": "false"}, clear=True),
            patch(
                "lambda_publisher.handler.build_runner",
                side_effect=RuntimeError(f"SDK returned credential {secret}"),
            ),
            contextlib.redirect_stdout(io.StringIO()) as output,
            self.assertRaisesRegex(RuntimeError, "publication invocation failed"),
        ):
            lambda_handler(event, types.SimpleNamespace(aws_request_id="test-request"))
        self.assertNotIn(secret, output.getvalue())
        self.assertIn("RuntimeError", output.getvalue())

    def test_missing_project_credential_falls_back_to_repository_token(self):
        with patch.dict(
            os.environ, {"GITHUB_TOKEN": "legacy-repository-token"}, clear=True
        ):
            self.assertEqual(
                _github_tokens(), ("legacy-repository-token", "legacy-repository-token")
            )


if __name__ == "__main__":
    unittest.main()
