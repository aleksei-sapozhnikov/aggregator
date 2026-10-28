#!/usr/bin/env python3
"""Reconcile the Argo CD admin password from an approved GitHub environment.

Only a bcrypt verifier crosses AWS SSM. Neither the plaintext password nor
the hash is printed in GitHub Actions logs or placed in Terraform state.
"""

from __future__ import annotations

import os
import re
import time

import bcrypt
import boto3
from botocore.exceptions import ClientError

REGION = "eu-central-1"
ACCOUNT_ID = "905418096305"


def resolve_instance_id() -> str:
    """Check the AWS account and locate the current K3s node when running locally."""
    account = boto3.client("sts", region_name=REGION).get_caller_identity()["Account"]
    if account != ACCOUNT_ID:
        raise RuntimeError(f"Expected AWS account {ACCOUNT_ID}, got {account!r}")
    supplied = os.environ.get("SSM_INSTANCE_ID", "")
    if supplied:
        if not re.fullmatch(r"i-[0-9a-f]{8,17}", supplied):
            raise ValueError("Invalid K3s instance ID")
        return supplied
    response = boto3.client("ec2", region_name=REGION).describe_instances(
        Filters=[
            {"Name": "tag:Name", "Values": ["aggregator-demo-k3s"]},
            {"Name": "tag:Project", "Values": ["aggregator"]},
            {"Name": "tag:Environment", "Values": ["demo"]},
            {"Name": "instance-state-name", "Values": ["running"]},
        ]
    )
    matches = [
        instance["InstanceId"]
        for reservation in response["Reservations"]
        for instance in reservation["Instances"]
    ]
    if len(matches) != 1 or not re.fullmatch(r"i-[0-9a-f]{8,17}", matches[0]):
        raise RuntimeError(f"Expected one running K3s instance, found {len(matches)}")
    return matches[0]
HASH_PATTERN = re.compile(rb"^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$")
TERMINAL_STATUSES = {
    "Success",
    "Failed",
    "Cancelled",
    "TimedOut",
    "DeliveryTimedOut",
    "ExecutionTimedOut",
    "Undeliverable",
    "Terminated",
}
READ_COMMAND = "/usr/local/sbin/aggregator-argocd-admin-hash read"


def send_command(client, instance_id: str, script: str) -> str:
    """Submit a RunShellScript invocation and return only its command ID."""
    response = client.send_command(
        InstanceIds=[instance_id],
        DocumentName="AWS-RunShellScript",
        Parameters={"commands": [script], "executionTimeout": ["180"]},
        TimeoutSeconds=180,
        Comment="Reconcile Aggregator Argo CD administrator password verifier",
    )
    return response["Command"]["CommandId"]


def wait_for_invocation(client, instance_id: str, command_id: str) -> str:
    """Wait for SSM completion without printing its potentially sensitive output."""
    for _ in range(90):
        try:
            result = client.get_command_invocation(
                CommandId=command_id, InstanceId=instance_id
            )
        except ClientError as exc:
            if exc.response.get("Error", {}).get("Code") != "InvocationDoesNotExist":
                raise
            time.sleep(2)
            continue

        status = result["Status"]
        if status == "Success":
            return result.get("StandardOutputContent", "").strip()
        if status in TERMINAL_STATUSES:
            raise RuntimeError(
                f"Argo CD password SSM command {command_id} failed: {status}. "
                "Inspect the instance's SSM command output without disclosing "
                "password verifiers."
            )
        time.sleep(2)
    raise RuntimeError(f"Argo CD password SSM command {command_id} timed out")


def reconcile() -> bool:
    """Update the current bcrypt verifier only when the password changed."""
    plaintext = os.environ.get("ARGOCD_PASSWORD", "")
    password = plaintext.encode("utf-8")
    if not 16 <= len(password) <= 72 or any(char in password for char in (0, 10, 13)):
        raise ValueError(
            "Set ARGOCD_PASSWORD to 16-72 UTF-8 bytes without line breaks "
            "in the demo-infra-apply GitHub Environment secrets."
        )

    instance_id = resolve_instance_id()
    client = boto3.client("ssm", region_name=REGION)
    read_id = send_command(client, instance_id, READ_COMMAND)
    old_hash_text = wait_for_invocation(client, instance_id, read_id)
    old_hash = old_hash_text.encode("ascii")
    if old_hash:
        if not HASH_PATTERN.fullmatch(old_hash):
            raise ValueError("The current Argo CD bcrypt verifier is malformed")
        if bcrypt.checkpw(password, old_hash):
            print("Argo CD administrator password already matches the GitHub secret.")
            return False

    new_hash = bcrypt.hashpw(password, bcrypt.gensalt(rounds=12)).decode("ascii")
    if not HASH_PATTERN.fullmatch(new_hash.encode("ascii")):
        raise RuntimeError("Generated bcrypt verifier failed validation")

    # The only value in AWS Run Command parameters is the bcrypt verifier.
    # Restrictive regex validation ensures safe single-quote shell escaping.
    script = (
        f"printf '%s' '{new_hash}' | "
        "/usr/local/sbin/aggregator-argocd-admin-hash apply"
    )
    apply_id = send_command(client, instance_id, script)
    wait_for_invocation(client, instance_id, apply_id)
    print("Argo CD administrator password verifier updated through SSM.")
    return True


def main() -> None:
    """Report a non-sensitive deployment result in the GitHub Actions Summary."""
    changed = reconcile()
    summary_path = os.environ.get("GITHUB_STEP_SUMMARY")
    if summary_path:
        with open(summary_path, "a", encoding="utf-8") as summary:
            summary.write(
                "Argo CD administrator password: "
                + ("**updated**" if changed else "**unchanged**")
                + " from the protected GitHub Environment secret.\n"
            )


if __name__ == "__main__":
    main()
