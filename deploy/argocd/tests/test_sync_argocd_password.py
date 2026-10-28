"""Test GitHub-to-SSM password reconciliation without connecting to AWS."""

from __future__ import annotations

import contextlib
import importlib.util
import io
import os
import sys
import types
import unittest
from pathlib import Path
from typing import ClassVar
from unittest.mock import Mock, patch

SCRIPT = Path(__file__).resolve().parents[1] / "sync-argocd-password.py"
BCRYPT_HASH = b"$2b$12$" + b"." * 53


def load_module():
    """Mock optional dependencies so CI unit tests need only Python."""
    bcrypt = types.ModuleType("bcrypt")
    bcrypt.checkpw = Mock(return_value=True)
    bcrypt.gensalt = Mock(return_value=b"salt")
    bcrypt.hashpw = Mock(return_value=BCRYPT_HASH)
    boto3 = types.ModuleType("boto3")
    boto3.client = Mock()
    botocore = types.ModuleType("botocore")
    botocore.__path__ = []
    exceptions = types.ModuleType("botocore.exceptions")

    class ClientError(Exception):
        response: ClassVar[dict[str, dict[str, str]]] = {
            "Error": {"Code": "InvocationDoesNotExist"}
        }

    exceptions.ClientError = ClientError

    spec = importlib.util.spec_from_file_location("argocd_password_sync", SCRIPT)
    assert spec is not None and spec.loader is not None
    with patch.dict(
        sys.modules,
        {
            "bcrypt": bcrypt,
            "boto3": boto3,
            "botocore": botocore,
            "botocore.exceptions": exceptions,
        },
    ):
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
    return module


class PasswordSyncTests(unittest.TestCase):
    def test_unchanged_password_does_not_send_update(self) -> None:
        module = load_module()
        existing = BCRYPT_HASH.decode("ascii")
        with (
            patch.dict(
                os.environ,
                {
                    "SSM_INSTANCE_ID": "i-0eb7ef332aa95e884",
                    "ARGOCD_PASSWORD": "example-strong-password",
                },
            ),
            patch.object(
                module, "resolve_instance_id", return_value="i-0eb7ef332aa95e884"
            ),
            patch.object(module.boto3, "client", return_value=Mock()),
            patch.object(module, "send_command", return_value="ssm-read") as send,
            patch.object(module, "wait_for_invocation", return_value=existing),
            contextlib.redirect_stdout(io.StringIO()),
        ):
            self.assertFalse(module.reconcile())
        self.assertEqual(send.call_count, 1)

    def test_changed_password_sends_only_bcrypt_hash(self) -> None:
        module = load_module()
        module.bcrypt.checkpw = Mock(return_value=False)
        with (
            patch.dict(
                os.environ,
                {
                    "SSM_INSTANCE_ID": "i-0eb7ef332aa95e884",
                    "ARGOCD_PASSWORD": "example-strong-password",
                },
            ),
            patch.object(
                module, "resolve_instance_id", return_value="i-0eb7ef332aa95e884"
            ),
            patch.object(module.boto3, "client", return_value=Mock()),
            patch.object(module, "send_command", side_effect=["read", "write"]) as send,
            patch.object(
                module, "wait_for_invocation", return_value=BCRYPT_HASH.decode("ascii")
            ),
            contextlib.redirect_stdout(io.StringIO()),
        ):
            self.assertTrue(module.reconcile())
        script = send.call_args_list[-1].args[-1]
        self.assertIn(BCRYPT_HASH.decode("ascii"), script)
        self.assertNotIn("example-strong-password", script)
        self.assertEqual(send.call_count, 2)

    def test_missing_password_fails_closed_without_ssm(self) -> None:
        module = load_module()
        with (
            patch.dict(
                os.environ,
                {"SSM_INSTANCE_ID": "i-0eb7ef332aa95e884", "ARGOCD_PASSWORD": ""},
            ),
            patch.object(module, "send_command") as send,
            self.assertRaisesRegex(ValueError, "ARGOCD_PASSWORD"),
        ):
            module.reconcile()
        send.assert_not_called()

    def test_password_length_boundaries(self) -> None:
        module = load_module()
        for password in ("A" * 16, "A" * 72, "П" * 16, "П" * 36, "🌿" * 16):
            with (
                self.subTest(
                    characters=len(password), bytes=len(password.encode("utf-8"))
                ),
                patch.dict(os.environ, {"ARGOCD_PASSWORD": password}),
                patch.object(
                    module, "resolve_instance_id", return_value="i-0eb7ef332aa95e884"
                ),
                patch.object(module.boto3, "client", return_value=Mock()),
                patch.object(module, "send_command", return_value="read"),
                patch.object(
                    module,
                    "wait_for_invocation",
                    return_value=BCRYPT_HASH.decode("ascii"),
                ),
                contextlib.redirect_stdout(io.StringIO()),
            ):
                self.assertFalse(module.reconcile())

    def test_password_length_and_control_character_rejection(self) -> None:
        module = load_module()
        cases = (
            ("A" * 15, "at least 16 characters"),
            ("П" * 15, "at least 16 characters"),
            ("A" * 73, "72 UTF-8 bytes"),
            ("П" * 37, "72 UTF-8 bytes"),
            ("🌿" * 19, "72 UTF-8 bytes"),
            ("A" * 16 + "\n", "line breaks"),
            ("A" * 16 + "\r", "line breaks"),
            ("A" * 16 + "\x00", "null bytes"),
        )
        for password, message in cases:
            with (
                self.subTest(password_length=len(password), error=message),
                patch.object(module.os, "environ", {"ARGOCD_PASSWORD": password}),
                patch.object(module, "resolve_instance_id") as resolve_instance,
                self.assertRaisesRegex(ValueError, message),
            ):
                module.reconcile()
            resolve_instance.assert_not_called()

    def test_local_node_lookup_uses_running_tags(self) -> None:
        module = load_module()
        sts = Mock()
        sts.get_caller_identity.return_value = {"Account": module.ACCOUNT_ID}
        ec2 = Mock()
        ec2.describe_instances.return_value = {
            "Reservations": [{"Instances": [{"InstanceId": "i-0eb7ef332aa95e884"}]}]
        }
        with (
            patch.dict(os.environ, {"SSM_INSTANCE_ID": ""}),
            patch.object(module.boto3, "client", side_effect=[sts, ec2]),
        ):
            self.assertEqual(module.resolve_instance_id(), "i-0eb7ef332aa95e884")

    def test_local_node_lookup_rejects_wrong_account(self) -> None:
        module = load_module()
        sts = Mock()
        sts.get_caller_identity.return_value = {"Account": "000000000000"}
        with (
            patch.dict(os.environ, {"SSM_INSTANCE_ID": ""}),
            patch.object(module.boto3, "client", return_value=sts) as client,
            self.assertRaisesRegex(RuntimeError, "Expected AWS account"),
        ):
            module.resolve_instance_id()
        self.assertEqual(client.call_count, 1)


if __name__ == "__main__":
    unittest.main()
