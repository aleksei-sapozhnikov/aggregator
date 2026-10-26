#!/usr/bin/env python3
"""Summarize watchdog Lambda logs without invoking the function.

Run after a natural watchdog schedule or a reviewed infrastructure change to
confirm that reconciliation completed and to identify safe error types. By
default, the log window starts after the latest completed CloudFormation stack
update. After stack detachment, pass ``--start-time-utc`` explicitly. Raw log
messages and credential values are never printed.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from datetime import datetime, timedelta, timezone
from typing import Any

from aws_cli import AwsCliError, aws_json


EXPECTED_ACCOUNT = "905418096305"
STACK_NAME = "aggregator-publication"
LOG_GROUP = "/aws/lambda/aggregator-publication-runner"
ERROR_CODE = re.compile(r"\(([^)]+)\)")


def parse_utc_timestamp(value: str) -> datetime:
    """Parse an explicit ISO-8601 UTC timestamp for post-detachment checks."""
    normalized = value[:-1] + "+00:00" if value.endswith("Z") else value
    timestamp = datetime.fromisoformat(normalized)
    if timestamp.tzinfo is None or timestamp.utcoffset() != timedelta(0):
        raise ValueError("The timestamp must include the UTC offset Z or +00:00.")
    return timestamp.astimezone(timezone.utc)


def iso_utc(timestamp: datetime) -> str:
    """Render an aware timestamp in a stable UTC format."""
    return timestamp.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def safe_error_type(entry: dict[str, Any]) -> str | None:
    """Extract an exception class or service code without returning log text."""
    reason = entry.get("reason")
    match = ERROR_CODE.search(str(reason)) if reason else None
    if match:
        return match.group(1)
    error_type = entry.get("error_type")
    return str(error_type) if error_type else None


def collect_report(profile: str, region: str, start_time_utc: str | None) -> dict[str, Any]:
    """Read sanitized watchdog events after confirming the expected account."""
    identity = aws_json(profile, region, "sts", "get-caller-identity")
    if identity.get("Account") != EXPECTED_ACCOUNT:
        raise RuntimeError("The selected AWS profile resolved to an unexpected account.")

    stack_status = None
    stack_updated_at = None
    if start_time_utc:
        start_time = parse_utc_timestamp(start_time_utc)
        window_source = "explicit-start-time"
        stack_status = "not-queried"
    else:
        stack_response = aws_json(
            profile,
            region,
            "cloudformation",
            "describe-stacks",
            "--stack-name",
            STACK_NAME,
            "--query",
            "Stacks[0].{StackStatus:StackStatus,LastUpdatedTime:LastUpdatedTime}",
        )
        if not stack_response or stack_response.get("StackStatus") != "UPDATE_COMPLETE":
            raise RuntimeError(
                "The stack is not UPDATE_COMPLETE; supply --start-time-utc after stack detachment."
            )
        stack = stack_response
        raw_updated_at = stack.get("LastUpdatedTime")
        if not raw_updated_at:
            raise RuntimeError("CloudFormation returned no LastUpdatedTime.")
        if isinstance(raw_updated_at, datetime):
            stack_updated_at = raw_updated_at.astimezone(timezone.utc)
        else:
            stack_updated_at = parse_utc_timestamp(str(raw_updated_at))
        start_time = stack_updated_at + timedelta(seconds=1)
        stack_status = str(stack.get("StackStatus"))
        window_source = "cloudformation-last-updated"

    end_time = datetime.now(timezone.utc)
    if start_time > end_time:
        raise ValueError("The log window start time cannot be in the future.")

    logs = aws_json(
        profile,
        region,
        "logs",
        "filter-log-events",
        "--log-group-name",
        LOG_GROUP,
        "--start-time",
        str(int(start_time.timestamp() * 1000)),
        "--end-time",
        str(int(end_time.timestamp() * 1000)),
    )

    reconcile_start_count = 0
    completion_events = []
    safe_error_events = []
    for event in logs.get("Events", []):
        try:
            entry = json.loads(event.get("message", ""))
        except (json.JSONDecodeError, TypeError):
            continue
        event_time = datetime.fromtimestamp(event["timestamp"] / 1000, timezone.utc)
        if entry.get("level") == "info" and entry.get("phase") == "start" and entry.get("kind") == "reconcile":
            reconcile_start_count += 1
        elif entry.get("level") == "info" and entry.get("phase") == "end":
            completion_events.append(
                {"timestamp_utc": iso_utc(event_time), "status": str(entry.get("status", ""))}
            )
        elif entry.get("level") == "error":
            safe_error_events.append(
                {"timestamp_utc": iso_utc(event_time), "exception_type": safe_error_type(entry)}
            )

    return {
        "account": identity["Account"],
        "stack_status": stack_status,
        "stack_last_updated_utc": iso_utc(stack_updated_at) if stack_updated_at else None,
        "log_window_source": window_source,
        "log_window_start_utc": iso_utc(start_time),
        "log_window_end_utc": iso_utc(end_time),
        "reconcile_start_count": reconcile_start_count,
        "completion_events": completion_events,
        "safe_error_events": safe_error_events,
        "raw_log_messages_printed": False,
        "lambda_invoked_by_this_script": False,
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--profile", default="aggregator-admin")
    parser.add_argument("--region", default="eu-central-1")
    parser.add_argument(
        "--start-time-utc",
        help="ISO-8601 UTC timestamp to use when CloudFormation no longer owns the stack",
    )
    args = parser.parse_args(argv)

    try:
        report = collect_report(args.profile, args.region, args.start_time_utc)
        print(json.dumps(report, indent=2))
        return 0
    except AwsCliError as error:
        print(f"Read-only watchdog inspection failed: {error}", file=sys.stderr)
        return 2
    except (KeyError, TypeError, ValueError, RuntimeError) as error:
        print(f"Read-only watchdog inspection stopped: {error}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
