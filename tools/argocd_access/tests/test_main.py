"""Offline tests for the Argo CD access and AWS Secrets Manager CLI."""

from __future__ import annotations

import argparse
import contextlib
import io
import json
import subprocess
import sys
import types
import unittest
from unittest.mock import Mock, patch

from tools.argocd_access import main as access


def options(profile: str | None = None, local_port: int = 8080) -> argparse.Namespace:
    """Build representative options for both Linux and Windows runs."""
    return argparse.Namespace(
        region="eu-central-1", profile=profile, local_port=local_port
    )


class ArgoCDToolTests(unittest.TestCase):
    def test_find_current_running_instance(self) -> None:
        with patch.object(
            access,
            "aws_output",
            side_effect=[access.ACCOUNT_ID, json.dumps(["i-0eb7ef332aa95e884"])],
        ) as query:
            self.assertEqual(
                access.resolve_instance_id(options()), "i-0eb7ef332aa95e884"
            )
        self.assertIn(
            "Name=instance-state-name,Values=running",
            query.call_args.args,
        )

    def test_missing_and_duplicate_instances_fail_closed(self) -> None:
        for ids in ([], ["i-0eb7ef332aa95e884", "i-0123456789abcdef0"]):
            with self.subTest(ids=ids):
                with patch.object(
                    access,
                    "aws_output",
                    side_effect=[access.ACCOUNT_ID, json.dumps(ids)],
                ):
                    with self.assertRaisesRegex(RuntimeError, "Expected one"):
                        access.resolve_instance_id(options())

    def test_wrong_aws_account_blocks_instance_lookup(self) -> None:
        with patch.object(access, "aws_output", return_value="000000000000") as query:
            with self.assertRaisesRegex(RuntimeError, "Expected AWS account"):
                access.resolve_instance_id(options())
        self.assertEqual(query.call_count, 1)

    def test_same_ssm_command_works_on_windows_and_linux(self) -> None:
        command = access.forwarding_command(
            options(profile="aggregator-admin"), "i-0eb7ef332aa95e884"
        )
        self.assertEqual(command[:4], ["aws", "ssm", "start-session", "--target"])
        self.assertIn("portNumber=18080,localPortNumber=8080", command)
        self.assertEqual(command[-2:], ["--profile", "aggregator-admin"])

    def test_connect_opens_tunnel_without_shell(self) -> None:
        with (
            patch.object(
                access, "resolve_instance_id", return_value="i-0eb7ef332aa95e884"
            ),
            patch.object(access.subprocess, "call", return_value=0) as run,
            contextlib.redirect_stdout(io.StringIO()),
        ):
            self.assertEqual(access.main(["connect"]), 0)
        self.assertIsInstance(run.call_args.args[0], list)
        self.assertNotIn("shell", run.call_args.kwargs)

    def test_password_help_does_not_use_cloud_credentials(self) -> None:
        output = io.StringIO()
        with (
            patch.object(access, "aws_output") as query,
            contextlib.redirect_stdout(output),
        ):
            self.assertEqual(access.main(["password"]), 0)
        query.assert_not_called()
        self.assertIn("aggregator%2Fdemo%2Fargocd-admin", output.getvalue())

    def test_password_validation_rejects_unsafe_values(self) -> None:
        for password in ("short", "x" * 73, "secure-password\nnew-line"):
            with self.subTest(password=password):
                with self.assertRaises(ValueError):
                    access.validate_password(password)
        access.validate_password("secure-password-123")

    def test_password_set_creates_or_rotates_without_exposing_value(self) -> None:
        password = "strong-secret-password-123"

        class FakeClientError(Exception):
            def __init__(self, code: str) -> None:
                super().__init__(code)
                self.response = {"Error": {"Code": code}}

        boto3 = types.ModuleType("boto3")
        botocore = types.ModuleType("botocore")
        botocore.__path__ = []
        exceptions = types.ModuleType("botocore.exceptions")
        exceptions.ClientError = FakeClientError
        with patch.dict(
            sys.modules,
            {"boto3": boto3, "botocore": botocore, "botocore.exceptions": exceptions},
        ):
            for exists in (False, True):
                with self.subTest(exists=exists):
                    client = Mock()
                    if not exists:
                        client.describe_secret.side_effect = FakeClientError(
                            "ResourceNotFoundException"
                        )
                    boto3.Session = Mock(
                        return_value=Mock(client=Mock(return_value=client))
                    )
                    stdout = io.StringIO()
                    with (
                        patch.object(access, "verify_account") as account_check,
                        patch.object(
                            access.getpass, "getpass", side_effect=[password, password]
                        ),
                        contextlib.redirect_stdout(stdout),
                    ):
                        access.set_password(options(profile="aggregator-admin"))
                    account_check.assert_called_once()
                    kwargs = (
                        client.put_secret_value.call_args.kwargs
                        if exists
                        else client.create_secret.call_args.kwargs
                    )
                    self.assertEqual(kwargs["SecretString"], password)
                    self.assertNotIn(password, stdout.getvalue())
                    client.get_secret_value.assert_not_called()
                    if not exists:
                        self.assertEqual(len(kwargs["Tags"]), 2)

    def test_password_mismatch_never_calls_write(self) -> None:
        class FakeClientError(Exception):
            pass

        boto3 = types.ModuleType("boto3")
        exceptions = types.ModuleType("botocore.exceptions")
        exceptions.ClientError = FakeClientError
        boto3.Session = Mock(
            return_value=Mock(client=Mock(return_value=Mock()))
        )
        client = boto3.Session().client()
        with (
            patch.dict(sys.modules, {"boto3": boto3, "botocore.exceptions": exceptions}),
            patch.object(access, "verify_account"),
            patch.object(access.getpass, "getpass", side_effect=["one-pass", "other"]),
        ):
            with self.assertRaisesRegex(ValueError, "do not match"):
                access.set_password(options())
        client.put_secret_value.assert_not_called()
        client.create_secret.assert_not_called()


if __name__ == "__main__":
    unittest.main()
