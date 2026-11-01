#!/usr/bin/env python3
"""Read or install the Argo CD admin bcrypt hash; never accept a plaintext password.

Read mode returns the current bcrypt hash to an approved SSM caller. Apply
mode reads a new bcrypt hash from stdin. All commands stay on the K3s node.
"""

from __future__ import annotations

import base64
import json
import re
import subprocess
import sys
import tempfile
from datetime import datetime, timezone
from pathlib import Path

KUBECTL = ("/usr/local/bin/k3s", "kubectl", "--namespace=argocd")
BCRYPT_HASH = re.compile(rb"^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$")


def kubectl(*args: str) -> str:
    """Capture kubectl stdout and stderr instead of echoing command arguments."""
    result = subprocess.run(
        [*KUBECTL, *args],
        check=True,
        capture_output=True,
        text=True,
    )
    return result.stdout


def current_hash() -> bytes:
    """Read the existing Kubernetes bcrypt hash without changing the Secret."""
    secret = json.loads(kubectl("get", "secret", "argocd-secret", "-o", "json"))
    encoded = secret.get("data", {}).get("admin.password")
    if not encoded:
        return b""
    return base64.b64decode(encoded, validate=True)


def apply_hash(digest: bytes) -> None:
    """Update the Argo CD administrator hash and invalidate previous sessions."""
    if not BCRYPT_HASH.fullmatch(digest):
        raise ValueError("Expected a valid bcrypt password hash on stdin")
    if digest == current_hash():
        print("Argo CD admin bcrypt hash already matches")
        return

    patch = {
        "stringData": {
            "admin.password": digest.decode("ascii"),
            "admin.passwordMtime": datetime.now(timezone.utc).strftime(
                "%Y-%m-%dT%H:%M:%SZ"
            ),
        }
    }
    descriptor, path = tempfile.mkstemp(
        prefix="argocd-admin-", suffix=".json", dir="/run"
    )
    try:
        with open(descriptor, "w", encoding="utf-8") as handle:
            json.dump(patch, handle)
        kubectl(
            "patch", "secret", "argocd-secret", "--type=merge", f"--patch-file={path}"
        )
    finally:
        Path(path).unlink(missing_ok=True)

    kubectl(
        "delete", "secret", "argocd-initial-admin-secret", "--ignore-not-found=true"
    )
    print("Argo CD admin password hash updated")


def main(argv: list[str]) -> int:
    """Support exactly two explicit modes for SSM-driven reconciliation."""
    if argv == ["read"]:
        digest = current_hash()
        if digest and not BCRYPT_HASH.fullmatch(digest):
            raise ValueError("Current Argo CD admin password hash is invalid")
        sys.stdout.write(digest.decode("ascii"))
        return 0
    if argv == ["apply"]:
        apply_hash(sys.stdin.buffer.read().strip())
        return 0
    print("Usage: argocd-admin-hash read|apply", file=sys.stderr)
    return 2


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
