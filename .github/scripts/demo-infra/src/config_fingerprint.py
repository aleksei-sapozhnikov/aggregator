"""Track successful K3s node configuration independently of Git branch history.

The fingerprint covers only files that configure the node, not the entire
repository SHA, generated GitOps manifests, or tests/documentation.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[4]
PARAMETER = "/aggregator/demo/ansible/last-successful-config-sha256"
CONFIG_SOURCES = (
    "infra/demo/ansible/site.yml",
    "infra/demo/ansible/group_vars",
    "infra/demo/ansible/roles",
    "infra/demo/node-configure.sh",
    "infra/demo/ssm-node-configure.sh",
    "deploy/argocd/src/argocd_admin_hash.py",
)
INSTANCE_ID = re.compile(r"i-[0-9a-f]{8,17}\Z")
SHA256 = re.compile(r"[0-9a-f]{64}\Z")


def command(*args: str, cwd: Path = ROOT) -> subprocess.CompletedProcess[str]:
    return subprocess.run(args, cwd=cwd, capture_output=True, text=True, check=False)


def fingerprint() -> str:
    result = subprocess.run(
        ["git", "ls-tree", "-r", "-z", "HEAD", "--", *CONFIG_SOURCES],
        cwd=ROOT,
        capture_output=True,
        check=True,
    )
    entries: list[tuple[bytes, bytes, bytes]] = []
    for entry in result.stdout.split(b"\0"):
        if not entry:
            continue
        metadata, path = entry.split(b"\t", 1)
        if b"/tests/" in path or path.endswith(b"/README.md"):
            continue
        mode, kind, object_id = metadata.split(b" ")
        if kind != b"blob":
            raise ValueError(f"Unexpected non-file configuration entry: {path!r}")
        entries.append((path, mode, object_id))
    if not entries:
        raise ValueError("No tracked node configuration files found")
    included = {path.decode("utf-8") for path, _, _ in entries}
    for required in (
        "infra/demo/ansible/site.yml",
        "infra/demo/node-configure.sh",
        "infra/demo/ssm-node-configure.sh",
        "deploy/argocd/src/argocd_admin_hash.py",
    ):
        if required not in included:
            raise ValueError(f"Missing tracked node configuration source: {required}")
    digest = hashlib.sha256(b"aggregator-k3s-config-v1\n")
    for path, mode, object_id in sorted(entries):
        digest.update(path + b"\0" + mode + b"\0" + object_id + b"\n")
    return digest.hexdigest()


def state_instance_id() -> str | None:
    result = command("tofu", "output", "-json", cwd=ROOT / "infra/demo")
    if result.returncode:
        raise RuntimeError(f"Unable to read OpenTofu outputs: {result.stderr.strip()}")
    values = json.loads(result.stdout)
    instance_id = values.get("k3s_instance_id", {}).get("value")
    if instance_id is None:
        return None
    if not isinstance(instance_id, str) or not INSTANCE_ID.fullmatch(instance_id):
        raise ValueError("Unexpected K3s instance ID in OpenTofu state")
    return instance_id


def aws(*args: str) -> subprocess.CompletedProcess[str]:
    return command(
        "aws", "ssm", *args, "--region", os.getenv("AWS_REGION", "eu-central-1")
    )


def previous_value() -> str | None:
    result = aws("get-parameter", "--name", PARAMETER, "--output", "json")
    if result.returncode:
        if "ParameterNotFound" in result.stderr:
            return None
        raise RuntimeError(
            f"Cannot read SSM configuration fingerprint: {result.stderr.strip()}"
        )
    value = json.loads(result.stdout)["Parameter"]["Value"]
    if not isinstance(value, str):
        raise TypeError("Unexpected SSM parameter value")
    return value


def output(name: str, value: str) -> None:
    destination = os.environ["GITHUB_OUTPUT"]
    with open(destination, "a", encoding="utf-8") as stream:
        stream.write(f"{name}={value}\n")


def check() -> None:
    digest = fingerprint()
    output("config_fingerprint", digest)
    if os.getenv("K3S_ENABLED") == "false":
        output("ansible_changed", "false")
        print("K3s is disabled; no node configuration required")
        return
    if os.getenv("K3S_ENABLED") != "true":
        raise ValueError("K3S_ENABLED must be explicitly true or false")

    current_id = state_instance_id()
    creating = os.getenv("K3S_CREATED") == "true"
    manual = os.getenv("MANUAL_REAPPLY") == "true"
    if not current_id and not creating:
        raise RuntimeError("K3s enabled but no existing or planned K3s EC2 exists")

    current = previous_value()
    expected = f"{current_id}:{digest}" if current_id else None
    changed = manual or creating or current != expected
    reason = (
        "Manual Ansible reconciliation requested"
        if manual
        else "New or replaced K3s instance requires configuration"
        if creating
        else "No successful configuration fingerprint is recorded"
        if current is None
        else "Last successful node configuration belongs to another EC2 or differs"
        if current != expected
        else "K3s node configuration already matches the last successful run"
    )
    output("ansible_changed", str(changed).lower())
    reason_path = Path(os.environ["RUNNER_TEMP"]) / "ansible-change-reason.txt"
    reason_path.write_text(reason + "\n", encoding="utf-8")
    (Path(os.environ["RUNNER_TEMP"]) / "ansible-changed-files.txt").write_text(
        "Fingerprint covers infra/demo/ansible, node launch scripts and Argo CD helper.\n"
        if changed
        else "",
        encoding="utf-8",
    )
    (Path(os.environ["RUNNER_TEMP"]) / "ansible-diff.patch").write_text(
        "", encoding="utf-8"
    )
    print(f"Ansible configuration comparison: {reason}; changed={changed}")


def record() -> None:
    instance_id = os.environ["SSM_INSTANCE_ID"]
    if not INSTANCE_ID.fullmatch(instance_id):
        raise ValueError("Invalid K3s instance ID")
    current_id = state_instance_id()
    if current_id != instance_id:
        raise RuntimeError(
            "K3s instance changed since configuration; refusing to record success"
        )
    digest = fingerprint()
    if digest != os.environ["EXPECTED_FINGERPRINT"] or not SHA256.fullmatch(digest):
        raise RuntimeError(
            "Node configuration fingerprint does not match the approved plan"
        )
    result = aws(
        "put-parameter",
        "--name",
        PARAMETER,
        "--type",
        "String",
        "--value",
        f"{instance_id}:{digest}",
        "--overwrite",
        "--output",
        "json",
    )
    if result.returncode:
        raise RuntimeError(
            f"Unable to record successful Ansible configuration: {result.stderr.strip()}"
        )
    print(f"Recorded last successful K3s configuration for {instance_id}: {digest}")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=["check", "record", "fingerprint"])
    args = parser.parse_args()
    try:
        if args.action == "check":
            check()
        elif args.action == "record":
            record()
        else:
            print(fingerprint())
    except (
        ValueError,
        TypeError,
        RuntimeError,
        subprocess.CalledProcessError,
        KeyError,
        OSError,
    ) as exc:
        print(f"::error::{exc}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
