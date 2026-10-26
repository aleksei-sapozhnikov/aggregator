#!/usr/bin/env python3
"""Review and optionally release only the publication Lambda ZIP.

Use after changing runtime code, building the deterministic ZIP, and reviewing
the candidate package. Without ``--apply`` this command only reads account and
Lambda metadata. With ``--apply`` it requires typing the function name, updates
only the code using the observed revision ID, and verifies the completed
update. It never changes Lambda environment variables or invokes a publication
event.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import subprocess
import sys
from pathlib import Path

from aws_cli import AwsCliError, aws_json, aws_output


EXPECTED_ACCOUNT = "905418096305"
FUNCTION_NAME = "aggregator-publication-runner"
REPOSITORY_ROOT = Path(__file__).resolve().parents[5]
BUILDER = Path(__file__).resolve().with_name("build_lambda_zip.py")
ZIP_PATH = REPOSITORY_ROOT / ".temp" / "publication-lambda.zip"
MANIFEST_PATH = ZIP_PATH.with_suffix(ZIP_PATH.suffix + ".manifest.json")


def run_builder() -> dict[str, str]:
    """Build the local ZIP and verify its checksum against the manifest."""
    subprocess.run([sys.executable, str(BUILDER)], check=True)
    manifest = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
    digest = hashlib.sha256(ZIP_PATH.read_bytes()).hexdigest()
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
    parser.add_argument(
        "--apply",
        action="store_true",
        help="submit the code-only update after typing the function name",
    )
    args = parser.parse_args(argv)

    try:
        manifest = run_builder()
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

        zip_uri = f"fileb://{ZIP_PATH.resolve().as_posix()}"
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
