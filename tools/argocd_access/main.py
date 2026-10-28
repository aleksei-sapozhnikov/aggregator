"""Connect privately to Argo CD and manage its administrator password.

The K3s instance is resolved from live AWS EC2 metadata, not cached IDs.
Passwords are entered through a hidden prompt and never passed on a command line.
"""

from __future__ import annotations

import argparse
import getpass
import json
import re
import subprocess
import sys
from urllib.parse import quote

REGION = "eu-central-1"
ACCOUNT_ID = "905418096305"
SECRET_NAME = "aggregator/demo/argocd-admin"
REMOTE_PORT = 18080
INSTANCE_ID_PATTERN = re.compile(r"^i-[0-9a-f]{8,17}$")
PROFILE_PATTERN = re.compile(r"^[a-zA-Z0-9_.-]+$")


def secret_url(region: str = REGION) -> str:
    """Link to the named secret in AWS Console without retrieving its value."""
    return (
        f"https://{region}.console.aws.amazon.com/secretsmanager/secret?"
        f"name={quote(SECRET_NAME, safe='')}&region={region}"
    )


def aws_command(args: argparse.Namespace, *arguments: str) -> list[str]:
    """Build a platform-neutral AWS CLI command without a shell."""
    command = ["aws", *arguments, "--region", args.region]
    if args.profile:
        command.extend(["--profile", args.profile])
    return command


def aws_output(args: argparse.Namespace, *arguments: str) -> str:
    """Read AWS metadata; never print AWS CLI output on failure."""
    try:
        return subprocess.run(
            aws_command(args, *arguments),
            check=True,
            capture_output=True,
            text=True,
        ).stdout.strip()
    except FileNotFoundError as exc:
        raise RuntimeError("AWS CLI is missing; install it and configure credentials") from exc
    except subprocess.CalledProcessError as exc:
        raise RuntimeError(
            f"AWS CLI metadata lookup failed (exit {exc.returncode}). "
            "Check credentials, region, and permissions."
        ) from exc


def verify_account(args: argparse.Namespace) -> None:
    """Fail closed if the selected profile points to another AWS account."""
    account = aws_output(
        args, "sts", "get-caller-identity", "--query", "Account", "--output", "text"
    )
    if account != ACCOUNT_ID:
        raise RuntimeError(
            f"Expected AWS account {ACCOUNT_ID}; got {account!r}. Refusing operation."
        )


def resolve_instance_id(args: argparse.Namespace) -> str:
    """Find one running, tagged K3s instance in the expected AWS account."""
    verify_account(args)
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
    """Construct the same SSM connection arguments for Windows and Linux."""
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


def print_password_instructions(region: str = REGION) -> None:
    """Explain how the password is stored and rotated without reading it."""
    print(f"Argo CD user: admin; secret: {SECRET_NAME} ({region})")
    print(f"Secret in AWS Console: {secret_url(region)}")
    print("To set or rotate: python run-tools.py argocd password set")
    print("Alternatively, edit the plain-text value in AWS Secrets Manager.")
    print("The EC2 timer reconciles changes in about five minutes when online.")
    print("Do not place the password in Git, Terraform, CI logs, or shell arguments.")


def validate_password(password: str) -> None:
    """Match the EC2 reconciliation service's password contract."""
    raw = password.encode("utf-8")
    if not 16 <= len(raw) <= 72 or any(char in raw for char in (0, 10, 13)):
        raise ValueError("Password must be 16-72 UTF-8 bytes without line breaks")


def set_password(args: argparse.Namespace) -> None:
    """Create or rotate only the named AWS secret through boto3 and getpass."""
    # Verify the selected account before prompting for sensitive information.
    verify_account(args)
    try:
        import boto3
        from botocore.exceptions import ClientError
    except ImportError as exc:
        raise RuntimeError(
            "AWS SDK for Python is required: python -m pip install boto3"
        ) from exc

    session = boto3.Session(profile_name=args.profile, region_name=args.region)
    client = session.client("secretsmanager")
    try:
        client.describe_secret(SecretId=SECRET_NAME)
        exists = True
    except ClientError as exc:
        if exc.response.get("Error", {}).get("Code") != "ResourceNotFoundException":
            raise RuntimeError(
                "Unable to inspect the Argo CD secret; check IAM permissions."
            ) from exc
        exists = False

    first = getpass.getpass("New Argo CD admin password: ")
    second = getpass.getpass("Confirm new password: ")
    if first != second:
        raise ValueError("Passwords do not match")
    validate_password(first)

    try:
        if exists:
            client.put_secret_value(SecretId=SECRET_NAME, SecretString=first)
            action = "Updated"
        else:
            client.create_secret(
                Name=SECRET_NAME,
                Description="Aggregator demo Argo CD administrator password",
                SecretString=first,
                Tags=[
                    {"Key": "Project", "Value": "aggregator"},
                    {"Key": "Environment", "Value": "demo"},
                ],
            )
            action = "Created"
    except ClientError as exc:
        raise RuntimeError(
            "Unable to save the Argo CD secret; check IAM permissions and "
            "whether the admin IAM policies were applied."
        ) from exc
    finally:
        del first, second

    print(f"{action} {SECRET_NAME} in AWS Secrets Manager ({args.region}).")
    print(f"Secret in AWS Console: {secret_url(args.region)}")
    print("The EC2 timer will reconcile the password in about five minutes.")


def make_parser() -> argparse.ArgumentParser:
    """Define the repository's cross-platform Argo CD CLI."""
    parser = argparse.ArgumentParser(description=__doc__)
    subparsers = parser.add_subparsers(dest="action", required=True)
    for name in ("connect", "instructions", "password"):
        sub = subparsers.add_parser(name)
        sub.add_argument("--region", default=REGION, choices=[REGION])
        sub.add_argument("--profile", help="Optional AWS CLI profile")
        if name != "password":
            sub.add_argument("--local-port", type=int, default=8080)
        else:
            sub.add_argument("operation", nargs="?", choices=["set"])
    return parser


def main(argv: list[str] | None = None) -> int:
    """Print connection information, start an SSM tunnel or save a password."""
    parser = make_parser()
    args = parser.parse_args(argv)
    if args.profile and not PROFILE_PATTERN.fullmatch(args.profile):
        parser.error("Invalid --profile: use letters, digits, underscores, dots, hyphens")

    if args.action == "password" and args.operation is None:
        print_password_instructions(args.region)
        return 0

    if args.action == "password":
        try:
            set_password(args)
            return 0
        except (RuntimeError, ValueError) as exc:
            print(f"error: {exc}", file=sys.stderr)
            return 1
        except KeyboardInterrupt:
            return 130

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
    print_password_instructions(args.region)
    if args.action == "instructions":
        return 0

    print("Opening the SSM tunnel; press Ctrl+C to close it.", flush=True)
    try:
        return subprocess.call(command)
    except FileNotFoundError:
        print("error: AWS CLI is missing", file=sys.stderr)
        return 1
    except KeyboardInterrupt:
        return 130


if __name__ == "__main__":
    raise SystemExit(main())
