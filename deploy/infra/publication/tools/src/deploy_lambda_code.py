#!/usr/bin/env python3
"""Build and review a Lambda code release; deploy only with ``--apply``.

Deployment requires the function name and uses its observed revision ID.
Environment variables are unchanged and the function is never invoked.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import subprocess
import sys
from pathlib import Path

from aws_cli import AwsCliError, aws_json, aws_output
from build_lambda_zip import DEFAULT_OUTPUT


EXPECTED_ACCOUNT = "905418096305"
FUNCTION_NAME = "aggregator-publication-runner"
BUILDER = Path(__file__).resolve().with_name("build_lambda_zip.py")


def run_builder(source: Path, output: Path = DEFAULT_OUTPUT) -> dict[str, str]:
    """Build the local ZIP and verify its checksum against the manifest."""
    output = output.resolve()
    subprocess.run(
        [sys.executable, str(BUILDER), "--source", str(source.resolve()), "--output", str(output)],
        check=True,
    )
    manifest_path = output.with_suffix(output.suffix + ".manifest.json")
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    digest = hashlib.sha256(output.read_bytes()).hexdigest()
    if digest != manifest.get("artifact_sha256_hex", "").lower():
        raise ValueError("The ZIP checksum does not match its manifest.")
    return manifest


def get_function_configuration(profile: str, region: str) -> dict[str, str]:
    """Read only code revision and update metadata for the target function."""
    return aws_json(
        profile,
        region,
        "lambda",
        "get-function-configuration",
        "--function-name",
        FUNCTION_NAME,
        "--query",
        "{RevisionId:RevisionId,CodeSha256:CodeSha256,State:State,LastUpdateStatus:LastUpdateStatus}",
    )


def wait_for_code_update(profile: str, region: str, expected_hash: str) -> dict[str, str]:
    """Wait for the code-only update and verify its final Lambda hash."""
    aws_output(
        profile,
        region,
        "lambda",
        "wait",
        "function-updated-v2",
        "--function-name",
        FUNCTION_NAME,
    )
    configuration = get_function_configuration(profile, region)
    if (
        configuration.get("State") != "Active"
        or configuration.get("LastUpdateStatus") != "Successful"
        or configuration.get("CodeSha256") != expected_hash
    ):
        raise RuntimeError("The completed Lambda update did not match the candidate ZIP.")
    return configuration


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--profile", default="aggregator-admin")
    parser.add_argument("--region", default="eu-central-1")
    parser.add_argument("--source", type=Path, required=True, help="Lambda package source directory")
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT, help="candidate ZIP output path")
    parser.add_argument(
        "--apply",
        action="store_true",
        help="submit the code-only update after typing the function name",
    )
    args = parser.parse_args(argv)

    try:
        manifest = run_builder(args.source, args.output)
        identity = aws_json(args.profile, args.region, "sts", "get-caller-identity")
        if identity.get("Account") != EXPECTED_ACCOUNT:
            raise RuntimeError("The selected AWS profile resolved to an unexpected account.")

        configuration = get_function_configuration(args.profile, args.region)
        if configuration.get("State") != "Active":
            raise RuntimeError("The publication Lambda is not Active.")
        if configuration.get("LastUpdateStatus") not in (None, "Successful"):
            raise RuntimeError("The publication Lambda has an unfinished or failed update.")

        candidate_hash = manifest["artifact_sha256_base64"]
        candidate_digest = manifest["artifact_sha256_hex"]
        current_hash = configuration.get("CodeSha256", "")
        print(f"Account: {EXPECTED_ACCOUNT}")
        print(f"Function: {FUNCTION_NAME}")
        print(f"Current CodeSha256: {current_hash}")
        print(f"Candidate CodeSha256: {candidate_hash}")
        print(f"Candidate SHA-256: {candidate_digest}")

        if current_hash == candidate_hash:
            print("The live function already has this package; no update is needed.")
            return 0
        if not args.apply:
            print("Dry run only. No AWS resource was changed.")
            print("Review the candidate, then rerun with --apply for a code-only update.")
            return 0

        confirmation = input(f"Type {FUNCTION_NAME} to update only its Lambda package: ")
        if confirmation != FUNCTION_NAME:
            print("Confirmation did not match; no Lambda update was submitted.", file=sys.stderr)
            return 1

        zip_uri = f"fileb://{args.output.resolve().as_posix()}"
        aws_json(
            args.profile,
            args.region,
            "lambda",
            "update-function-code",
            "--function-name",
            FUNCTION_NAME,
            "--revision-id",
            configuration["RevisionId"],
            "--zip-file",
            zip_uri,
        )
        final_configuration = wait_for_code_update(args.profile, args.region, candidate_hash)
        print("Code-only update verified: State=Active, LastUpdateStatus=Successful.")
        print(f"CodeSha256: {final_configuration['CodeSha256']}")
        print("No environment variables were changed and no publication event was invoked.")
        return 0
    except AwsCliError as error:
        print(f"AWS operation failed: {error}", file=sys.stderr)
        return 2
    except (OSError, KeyError, json.JSONDecodeError, subprocess.CalledProcessError, ValueError, RuntimeError) as error:
        print(f"Code-only release stopped: {error}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
