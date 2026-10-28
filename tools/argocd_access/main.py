"""Open the private Argo CD web dashboard using one cross-platform SSM command.

The current K3s EC2 instance is resolved from live AWS metadata. Passwords
are managed only by the protected GitHub Actions environment, never here.
"""

from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys

REGION = "eu-central-1"
ACCOUNT_ID = "905418096305"
REMOTE_PORT = 18080
INSTANCE_ID_PATTERN = re.compile(r"^i-[0-9a-f]{8,17}$")
PROFILE_PATTERN = re.compile(r"^[a-zA-Z0-9_.-]+$")


def aws_command(args: argparse.Namespace, *arguments: str) -> list[str]:
    """Build a platform-neutral AWS CLI command without a shell."""
    command = ["aws", *arguments, "--region", args.region]
    if args.profile:
        command.extend(["--profile", args.profile])
    return command


def aws_output(args: argparse.Namespace, *arguments: str) -> str:
    """Read instance metadata without printing credentials or AWS CLI output."""
    try:
        return subprocess.run(
            aws_command(args, *arguments),
            check=True,
            capture_output=True,
            text=True,
        ).stdout.strip()
    except FileNotFoundError as exc:
        raise RuntimeError("AWS CLI is missing; install and configure AWS CLI") from exc
    except subprocess.CalledProcessError as exc:
        raise RuntimeError(
            f"AWS CLI lookup failed (exit {exc.returncode}). "
            "Check AWS credentials, region, and access permissions."
        ) from exc


def resolve_instance_id(args: argparse.Namespace) -> str:
    """Find exactly one running K3s instance in the expected AWS account."""
    account = aws_output(
        args, "sts", "get-caller-identity", "--query", "Account", "--output", "text"
    )
    if account != ACCOUNT_ID:
        raise RuntimeError(f"Expected AWS account {ACCOUNT_ID}, got {account!r}")

    response = aws_output(
        args,
        "ec2",
        "describe-instances",
        "--filters",
        "Name=tag:Name,Values=aggregator-demo-k3s",
        "Name=tag:Project,Values=aggregator",
        "Name=tag:Environment,Values=demo",
        "Name=instance-state-name,Values=running",
        "--query",
        "Reservations[].Instances[].InstanceId",
        "--output",
        "json",
    )
    try:
        ids = json.loads(response)
    except json.JSONDecodeError as exc:
        raise RuntimeError("EC2 returned invalid instance metadata") from exc
    if not isinstance(ids, list) or not all(
        isinstance(item, str) and INSTANCE_ID_PATTERN.fullmatch(item)
        for item in ids
    ):
        raise RuntimeError("EC2 returned unexpected instance IDs")
    if len(ids) != 1:
        raise RuntimeError(
            f"Expected one running aggregator-demo-k3s instance, found {len(ids)}."
        )
    return ids[0]


def forwarding_command(args: argparse.Namespace, instance_id: str) -> list[str]:
    """Construct the same SSM connection command for Windows and Linux."""
    return aws_command(
        args,
        "ssm",
        "start-session",
        "--target",
        instance_id,
        "--document-name",
        "AWS-StartPortForwardingSession",
        "--parameters",
        f"portNumber={REMOTE_PORT},localPortNumber={args.local_port}",
    )


def make_parser() -> argparse.ArgumentParser:
    """Define local connection-only commands."""
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="action", required=True)
    for name in ("connect", "instructions"):
        command = commands.add_parser(name)
        command.add_argument("--region", default=REGION, choices=[REGION])
        command.add_argument("--profile", help="Optional AWS CLI profile")
        command.add_argument("--local-port", type=int, default=8080)
    return parser


def main(argv: list[str] | None = None) -> int:
    """Print a concrete SSM command or launch a private local port forward."""
    parser = make_parser()
    args = parser.parse_args(argv)
    if args.profile and not PROFILE_PATTERN.fullmatch(args.profile):
        parser.error("Invalid --profile: use letters, digits, underscores, dots, hyphens")
    if not 1 <= args.local_port <= 65535:
        parser.error("--local-port must be between 1 and 65535")

    try:
        instance_id = resolve_instance_id(args)
    except RuntimeError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1

    command = forwarding_command(args, instance_id)
    print(f"K3s instance: {instance_id}")
    print(f"SSM command: {' '.join(command)}")
    print(f"Argo CD: https://localhost:{args.local_port}")
    print(
        "Admin password: GitHub Environment 'demo-infra-apply' "
        "secret 'ARGOCD_ADMIN_PASSWORD'."
    )

    if args.action == "instructions":
        return 0

    print("Opening SSM tunnel; press Ctrl+C to close it.", flush=True)
    try:
        return subprocess.call(command)
    except FileNotFoundError:
        print("error: AWS CLI is missing", file=sys.stderr)
        return 1
    except KeyboardInterrupt:
        return 130


if __name__ == "__main__":
    raise SystemExit(main())
