"""Summarize watchdog logs from an explicit UTC time without exposing raw messages."""

from __future__ import annotations

import argparse
import json
import re
import sys
from datetime import datetime, timedelta, timezone
from typing import Any

from aws_cli import AwsCliError, aws_json

EXPECTED_ACCOUNT = "905418096305"
LOG_GROUP = "/aws/lambda/aggregator-publication-runner"
ERROR_CODE = re.compile(r"\(([^)]+)\)")


def parse_utc_timestamp(value: str) -> datetime:
    """Parse an ISO-8601 timestamp with an explicit UTC offset."""
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


def collect_report(profile: str, region: str, start_time_utc: str) -> dict[str, Any]:
    """Read sanitized watchdog events after confirming the expected account."""
    identity = aws_json(profile, region, "sts", "get-caller-identity")
    if identity.get("Account") != EXPECTED_ACCOUNT:
        raise RuntimeError(
            "The selected AWS profile resolved to an unexpected account."
        )

    start_time = parse_utc_timestamp(start_time_utc)
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
    for event in logs.get("events", []):
        try:
            entry = json.loads(event.get("message", ""))
        except (json.JSONDecodeError, TypeError):
            continue
        event_time = datetime.fromtimestamp(event["timestamp"] / 1000, timezone.utc)
        if (
            entry.get("level") == "info"
            and entry.get("phase") == "start"
            and entry.get("kind") == "reconcile"
        ):
            reconcile_start_count += 1
        elif entry.get("level") == "info" and entry.get("phase") == "end":
            completion_events.append(
                {
                    "timestamp_utc": iso_utc(event_time),
                    "status": str(entry.get("status", "")),
                }
            )
        elif entry.get("level") == "error":
            safe_error_events.append(
                {
                    "timestamp_utc": iso_utc(event_time),
                    "exception_type": safe_error_type(entry),
                }
            )

    return {
        "account": identity["Account"],
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
        required=True,
        help="start of the log window as an ISO-8601 UTC timestamp",
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
