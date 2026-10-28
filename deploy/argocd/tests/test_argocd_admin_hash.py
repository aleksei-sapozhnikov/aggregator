"""Test Argo CD bcrypt-hash installation without a Kubernetes cluster."""

from __future__ import annotations

import base64
import contextlib
import importlib.util
import io
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

SCRIPT = Path(__file__).resolve().parents[1] / "argocd-admin-hash.py"
VALID_HASH = b"$2b$12$" + b"." * 53


def load_module():
    """Load the provisioned script as a module without importing dependencies."""
    spec = importlib.util.spec_from_file_location("argocd_hash", SCRIPT)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class ArgoCDHashTests(unittest.TestCase):
    def test_read_existing_hash(self) -> None:
        module = load_module()
        response = subprocess.CompletedProcess(
            args=[], returncode=0,
            stdout=json.dumps(
                {
                    "data": {
                        "admin.password": base64.b64encode(VALID_HASH).decode("ascii")
                    }
                }
            ), stderr=""
        )
        with patch.object(module.subprocess, "run", return_value=response):
            self.assertEqual(module.current_hash(), VALID_HASH)

    def test_unchanged_hash_does_not_patch_secret(self) -> None:
        module = load_module()
        with (
            patch.object(module, "current_hash", return_value=VALID_HASH),
            patch.object(module, "kubectl") as kubectl,
            contextlib.redirect_stdout(io.StringIO()),
        ):
            module.apply_hash(VALID_HASH)
        kubectl.assert_not_called()

    def test_new_hash_patches_and_deletes_initial_secret(self) -> None:
        module = load_module()
        calls = []
        real_mkstemp = tempfile.mkstemp
        with tempfile.TemporaryDirectory() as folder:
            def temporary_file(**kwargs):
                return real_mkstemp(
                    prefix=kwargs["prefix"], suffix=kwargs["suffix"], dir=folder
                )

            def track_kubectl(*args):
                calls.append(args)
                if "patch" in args:
                    filename = next(
                        part.removeprefix("--patch-file=")
                        for part in args if part.startswith("--patch-file=")
                    )
                    payload = json.loads(Path(filename).read_text(encoding="utf-8"))
                    self.assertEqual(
                        payload["stringData"]["admin.password"],
                        VALID_HASH.decode("ascii"),
                    )
                    self.assertIn("admin.passwordMtime", payload["stringData"])
                return ""

            with (
                patch.object(module, "current_hash", return_value=b""),
                patch.object(module, "kubectl", side_effect=track_kubectl),
                patch.object(module.tempfile, "mkstemp", side_effect=temporary_file),
                contextlib.redirect_stdout(io.StringIO()),
            ):
                module.apply_hash(VALID_HASH)
            self.assertEqual(list(Path(folder).glob("*")), [])

        self.assertTrue(any("patch" in call for call in calls))
        self.assertTrue(
            any("argocd-initial-admin-secret" in call for call in calls)
        )

    def test_rejects_plaintext_and_malformed_hash(self) -> None:
        module = load_module()
        for digest in (b"plaintext-password", b"$2b$12$short"):
            with (
                self.subTest(digest=digest),
                self.assertRaisesRegex(ValueError, "bcrypt"),
            ):
                module.apply_hash(digest)


if __name__ == "__main__":
    unittest.main()
