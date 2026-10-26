"""Interactively set or rotate the publication Lambda's GitHub tokens.

Run during initial setup or token rotation, before the next Lambda invocation.
Input is hidden, values are not stored locally, and Secrets Manager is updated
only after the operator types ``WRITE``.
"""
from __future__ import annotations

import argparse
import getpass
import sys


SECRETS = (
    ("GitHub repository token", "aggregator-publication-github-token"),
    ("GitHub Projects token", "aggregator-publication-project-token"),
)


def prompt_secret(label: str) -> str:
    first = getpass.getpass(f"{label}: ")
    second = getpass.getpass(f"Confirm {label}: ")
    if not first:
        raise ValueError(f"{label} cannot be empty")
    if first != second:
        raise ValueError(f"{label} confirmation did not match")
    return first


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--profile", default="aggregator-admin")
    parser.add_argument("--region", default="eu-central-1")
    args = parser.parse_args(argv)

    try:
        import boto3

        client = boto3.Session(profile_name=args.profile, region_name=args.region).client("secretsmanager")

        # Verify both secret containers before prompting or writing either value.
        arns = {}
        for _, secret_name in SECRETS:
            metadata = client.describe_secret(SecretId=secret_name)
            if metadata.get("Name") != secret_name or not metadata.get("ARN"):
                raise RuntimeError(f"Unexpected metadata for {secret_name}")
            arns[secret_name] = metadata["ARN"]

        values = {name: prompt_secret(label) for label, name in SECRETS}
        print("Two non-empty values are ready. Values will not be displayed or written to local files.")
        if input("Type WRITE to store both values in Secrets Manager: ") != "WRITE":
            print("No secret values were written.")
            return 1

        written = []
        try:
            for _, secret_name in SECRETS:
                result = client.put_secret_value(SecretId=arns[secret_name], SecretString=values[secret_name])
                written.append(secret_name)
                print(f"Stored a new AWSCURRENT version for {secret_name} (version {result['VersionId']}).")
        except Exception as error:
            code = getattr(error, "response", {}).get("Error", {}).get("Code", type(error).__name__)
            done = ", ".join(written) if written else "none"
            print(f"Secret write failed ({code}); completed before failure: {done}.", file=sys.stderr)
            return 2
        finally:
            values.clear()

        return 0
    except Exception as error:
        code = getattr(error, "response", {}).get("Error", {}).get("Code", type(error).__name__)
        print(f"Secret setup failed ({code}); no secret values were written.", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
