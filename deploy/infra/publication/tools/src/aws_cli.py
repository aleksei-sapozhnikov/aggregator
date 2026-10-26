"""Run AWS CLI commands with explicit credentials and redacted failure diagnostics."""

from __future__ import annotations

import json
import re
import shutil
import subprocess
from typing import Any

_ERROR_CODE = re.compile(r"An error occurred \(([^)]+)\)")


class AwsCliError(RuntimeError):
    """Represent a failed AWS CLI call without retaining its raw response."""

    def __init__(self, operation: str, code: str) -> None:
        self.operation = operation
        self.code = code
        super().__init__(f"{operation} failed ({code}).")


def aws_output(
    profile: str,
    region: str,
    *arguments: str,
    json_output: bool = False,
) -> str:
    """Run one AWS CLI command and return stdout, hiding failure diagnostics."""
    aws_executable = shutil.which("aws")
    operation = " ".join(arguments[:2]) or "AWS CLI call"
    if aws_executable is None:
        raise AwsCliError(operation, "AwsCliNotFound")

    command = [
        aws_executable,
        *arguments,
        "--profile",
        profile,
        "--region",
        region,
        "--no-cli-pager",
    ]
    if json_output:
        command.extend(("--output", "json"))

    try:
        result = subprocess.run(command, check=False, capture_output=True, text=True)
    except OSError as error:
        raise AwsCliError(operation, type(error).__name__) from None

    if result.returncode != 0:
        match = _ERROR_CODE.search(result.stderr)
        code = match.group(1) if match else "CallFailed"
        raise AwsCliError(operation, code)
    return result.stdout


def aws_json(profile: str, region: str, *arguments: str) -> Any:
    """Run an AWS CLI command that returns JSON and decode its response."""
    operation = " ".join(arguments[:2]) or "AWS CLI call"
    output = aws_output(profile, region, *arguments, json_output=True)
    if not output.strip():
        return None
    try:
        return json.loads(output)
    except json.JSONDecodeError:
        raise AwsCliError(operation, "InvalidJsonResponse") from None
