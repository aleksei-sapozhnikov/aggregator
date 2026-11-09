"""Publisher Lambda credentials must come from configured Secrets Manager ARNs."""

import os
import sys
import types
import unittest
from pathlib import Path
from unittest.mock import MagicMock, call, patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "runtime" / "src"))

from lambda_publisher.handler import _github_tokens


class LambdaCredentialTests(unittest.TestCase):
    def test_reads_both_configured_secrets(self):
        secret_client = MagicMock()
        secret_client.get_secret_value.side_effect = [
            {"SecretString": '{"token":"repository-token"}'},
            {"SecretString": "project-token"},
        ]
        boto3 = types.SimpleNamespace(client=MagicMock(return_value=secret_client))

        with patch.dict(
            os.environ,
            {
                "GITHUB_SECRET_ARN": "repository-secret-arn",
                "PROJECT_SECRET_ARN": "project-secret-arn",
            },
            clear=True,
        ), patch.dict(sys.modules, {"boto3": boto3}):
            self.assertEqual(
                ("repository-token", "project-token"),
                _github_tokens(),
            )

        boto3.client.assert_called_once_with("secretsmanager")
        self.assertEqual(
            [
                call(SecretId="repository-secret-arn"),
                call(SecretId="project-secret-arn"),
            ],
            secret_client.get_secret_value.call_args_list,
        )

    def test_legacy_token_environment_variables_are_not_fallbacks(self):
        with patch.dict(
            os.environ,
            {"GITHUB_TOKEN": "old-repository-token", "PROJECT_TOKEN": "old-project-token"},
            clear=True,
        ):
            with self.assertRaisesRegex(KeyError, "GITHUB_SECRET_ARN"):
                _github_tokens()


if __name__ == "__main__":
    unittest.main()
