"""Exercise Argo CD password reconciliation without AWS or Kubernetes access."""

from __future__ import annotations

import base64
import importlib.util
import json
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from types import ModuleType
from unittest.mock import patch


SCRIPT_PATH = (
    Path(__file__).resolve().parents[1]
    / "roles"
    / "argocd"
    / "files"
    / "argocd-admin-reconcile.py"
)


def fake_bcrypt() -> ModuleType:
    """Use a deterministic fake; no real password hashes are needed for tests."""
    module = ModuleType("bcrypt")
    module.gensalt = lambda rounds: b"unused-salt"
    module.hashpw = lambda password, _salt: b"fake:" + base64.b64encode(password)
    module.checkpw = lambda password, digest: digest == module.hashpw(password, b"")
    return module


class ReconcileTests(unittest.TestCase):
    def run_reconciliation(self, desired: str, existing: bytes) -> list[list[str]]:
        class FakeSecretsClient:
            def get_secret_value(self, *, SecretId: str) -> dict[str, str]:
                self_id = "aggregator/demo/argocd-admin"
                self_test.assertEqual(SecretId, self_id)
                return {"SecretString": desired}

        self_test = self
        fake_aws = ModuleType("boto3")
        fake_aws.client = lambda *_args, **_kwargs: FakeSecretsClient()
        module_spec = importlib.util.spec_from_file_location(
            "argocd_reconcile", SCRIPT_PATH
        )
        assert module_spec and module_spec.loader

        with patch.dict(sys.modules, {"boto3": fake_aws, "bcrypt": fake_bcrypt()}):
            module = importlib.util.module_from_spec(module_spec)
            module_spec.loader.exec_module(module)

        calls: list[list[str]] = []
        with tempfile.TemporaryDirectory() as folder:
            real_mkstemp = tempfile.mkstemp

            def mock_mkstemp(**kwargs):
                return real_mkstemp(
                    prefix=kwargs["prefix"], suffix=kwargs["suffix"], dir=folder
                )

            def mock_run(args, **_kwargs):
                calls.append(list(args))
                if "get" in args:
                    return subprocess.CompletedProcess(
                        args,
                        0,
                        stdout=json.dumps(
                            {
                                "data": {
                                    "admin.password": base64.b64encode(existing).decode()
                                }
                            }
                        ),
                        stderr="",
                    )
                if "patch" in args:
                    patch_path = next(
                        item.removeprefix("--patch-file=")
                        for item in args
                        if item.startswith("--patch-file=")
                    )
                    payload = json.loads(Path(patch_path).read_text(encoding="utf-8"))
                    self.assertNotIn(desired, json.dumps(payload))
                    self.assertIn("admin.passwordMtime", payload["stringData"])
                return subprocess.CompletedProcess(args, 0, stdout="", stderr="")

            with (
                patch.object(module.subprocess, "run", side_effect=mock_run),
                patch.object(module.tempfile, "mkstemp", side_effect=mock_mkstemp),
                patch.dict(
                    os.environ,
                    {
                        "ARGOCD_ADMIN_SECRET_ID": "aggregator/demo/argocd-admin",
                        "AWS_REGION": "eu-central-1",
                    },
                ),
            ):
                module.reconcile()

        return calls

    def test_matching_password_never_patches_kubernetes(self) -> None:
        secret = "correct-strong-password"
        calls = self.run_reconciliation(
            secret, b"fake:" + base64.b64encode(secret.encode())
        )
        self.assertEqual(len([c for c in calls if "patch" in c]), 0)

    def test_rotated_password_updates_secret_and_deletes_initial_password(self) -> None:
        calls = self.run_reconciliation("new-strong-password", b"fake:old")
        self.assertEqual(len([c for c in calls if "patch" in c]), 1)
        self.assertEqual(len([c for c in calls if "delete" in c]), 1)

    def test_short_password_is_rejected(self) -> None:
        with self.assertRaises(ValueError):
            self.run_reconciliation("short", b"fake:old")


if __name__ == "__main__":
    unittest.main()
