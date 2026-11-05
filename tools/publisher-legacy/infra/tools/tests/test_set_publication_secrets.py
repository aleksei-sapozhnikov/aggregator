"""Verify secret rotation failures do not expose credential values."""

from __future__ import annotations

import contextlib
import importlib.util
import io
import sys
import types
import unittest
from pathlib import Path
from unittest.mock import patch

SCRIPT = Path(__file__).resolve().parents[1] / "src/set_publication_secrets.py"


def load_script():
    spec = importlib.util.spec_from_file_location("set_publication_secrets", SCRIPT)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class FakeSecretsManager:
    def __init__(self, *, failure: str):
        self.failure = failure
        self.written: list[str] = []

    def describe_secret(self, *, SecretId: str) -> dict:
        if self.failure == "setup":
            raise RuntimeError("AWS setup failure with sensitive-credential-text")
        return {"Name": SecretId, "ARN": SecretId}

    def put_secret_value(self, *, SecretId: str, SecretString: str) -> dict:
        if self.failure == "write" and self.written:
            raise RuntimeError(f"AWS write failure with {SecretString}")
        self.written.append(SecretId)
        return {"VersionId": "test-version"}


class SecretRotationFailureTests(unittest.TestCase):
    def run_script(self, client: FakeSecretsManager) -> tuple[int, str, str]:
        module = load_script()
        boto3 = types.ModuleType("boto3")
        boto3.Session = lambda **_kwargs: types.SimpleNamespace(
            client=lambda _service: client
        )
        out, err = io.StringIO(), io.StringIO()
        with (
            patch.dict(sys.modules, {"boto3": boto3}),
            patch.object(
                module.getpass,
                "getpass",
                side_effect=[
                    "secret-one-value",
                    "secret-one-value",
                    "secret-two-value",
                    "secret-two-value",
                ],
            ),
            patch("builtins.input", return_value="WRITE"),
            contextlib.redirect_stdout(out),
            contextlib.redirect_stderr(err),
        ):
            status = module.main(["--profile", "test", "--region", "eu-central-1"])
        return status, out.getvalue(), err.getvalue()

    def test_partial_write_does_not_disclose_secret_values(self) -> None:
        client = FakeSecretsManager(failure="write")
        status, out, err = self.run_script(client)
        self.assertEqual(status, 2)
        self.assertEqual(client.written, ["aggregator-publication-github-token"])
        self.assertIn("completed before failure:", err)
        self.assertIn("RuntimeError", err)
        for sensitive in ("secret-one-value", "secret-two-value"):
            self.assertNotIn(sensitive, out + err)

    def test_failed_setup_does_not_disclose_error_text(self) -> None:
        client = FakeSecretsManager(failure="setup")
        status, out, err = self.run_script(client)
        self.assertEqual(status, 2)
        self.assertEqual(client.written, [])
        self.assertIn("Secret setup failed (RuntimeError)", err)
        self.assertNotIn("sensitive-credential-text", out + err)


if __name__ == "__main__":
    unittest.main()
