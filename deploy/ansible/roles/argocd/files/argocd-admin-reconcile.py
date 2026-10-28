#!/usr/bin/env python3
"""Reconcile Argo CD admin credentials from AWS Secrets Manager without logging secrets."""

from __future__ import annotations

import base64
import json
import os
import subprocess
import tempfile
from datetime import datetime, timezone
from pathlib import Path

import bcrypt
import boto3

KUBECTL = ("/usr/local/bin/k3s", "kubectl", "-n", "argocd")


def kubectl(*args: str) -> str:
    """Run a scoped kubectl command without echoing its arguments or output."""
    result = subprocess.run(
        [*KUBECTL, *args],
        check=True,
        capture_output=True,
        text=True,
    )
    return result.stdout


def reconcile() -> None:
    """Rotate only when the AWS password differs from the current bcrypt hash."""
    secret_id = os.environ["ARGOCD_ADMIN_SECRET_ID"]
    region = os.environ["AWS_REGION"]
    response = boto3.client("secretsmanager", region_name=region).get_secret_value(
        SecretId=secret_id
    )
    plaintext = response.get("SecretString")
    if not isinstance(plaintext, str):
        raise ValueError("Argo CD AWS secret must be a plain-text password")
    password = plaintext.encode("utf-8")
    if not 16 <= len(password) <= 72 or any(char in password for char in (0, 10, 13)):
        raise ValueError("Argo CD AWS secret must be 16-72 UTF-8 bytes without line breaks")

    kubernetes_secret = json.loads(kubectl("get", "secret", "argocd-secret", "-o", "json"))
    current_encoded = kubernetes_secret.get("data", {}).get("admin.password", "")
    if current_encoded:
        try:
            existing_hash = base64.b64decode(current_encoded, validate=True)
            if bcrypt.checkpw(password, existing_hash):
                print("Argo CD admin password already matches AWS Secrets Manager")
                return
        except (ValueError, TypeError):
            pass

    patch = {
        "stringData": {
            "admin.password": bcrypt.hashpw(password, bcrypt.gensalt(rounds=12)).decode("ascii"),
            "admin.passwordMtime": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        }
    }
    # The temporary file holds only the bcrypt hash, never the cleartext password.
    descriptor, path = tempfile.mkstemp(prefix="argocd-admin-", suffix=".json", dir="/run")
    try:
        with os.fdopen(descriptor, "w", encoding="utf-8") as handle:
            json.dump(patch, handle)
        kubectl("patch", "secret", "argocd-secret", "--type=merge", f"--patch-file={path}")
    finally:
        Path(path).unlink(missing_ok=True)

    # Argo CD's generated initial password is obsolete after a successful rotation.
    kubectl("delete", "secret", "argocd-initial-admin-secret", "--ignore-not-found=true")
    print("Argo CD admin password synchronized")


if __name__ == "__main__":
    reconcile()
