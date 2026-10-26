"""Check sanitized watchdog reports and UTC timestamp handling."""

from __future__ import annotations

import json
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

SOURCE_TOOLS = Path(__file__).resolve().parent.parent / "src"
sys.path.insert(0, str(SOURCE_TOOLS))

import inspect_watchdog_runtime
from inspect_watchdog_runtime import parse_utc_timestamp, safe_error_type


class WatchdogSummaryTests(unittest.TestCase):
    def test_report_uses_only_identity_and_logs_and_omits_raw_messages(self):
        start = "2026-01-01T00:00:00Z"
        timestamp = int(parse_utc_timestamp(start).timestamp() * 1000)
        logs = {
            "events": [
                {"timestamp": timestamp, "message": "not JSON"},
                {
                    "timestamp": timestamp,
                    "message": json.dumps(
                        {"level": "info", "phase": "end", "status": "disabled"}
                    ),
                },
                {
                    "timestamp": timestamp,
                    "message": json.dumps(
                        {
                            "level": "error",
                            "reason": "failed (AccessDenied): private@example.com",
                        }
                    ),
                },
            ]
        }
        with patch.object(
            inspect_watchdog_runtime,
            "aws_json",
            side_effect=[{"Account": inspect_watchdog_runtime.EXPECTED_ACCOUNT}, logs],
        ) as aws:
            report = inspect_watchdog_runtime.collect_report(
                "test-profile", "eu-central-1", start
            )

        self.assertEqual(
            [call.args[2:4] for call in aws.call_args_list],
            [("sts", "get-caller-identity"), ("logs", "filter-log-events")],
        )
        self.assertEqual(report["log_window_start_utc"], start)
        self.assertEqual(report["completion_events"][0]["status"], "disabled")
        self.assertEqual(
            report["safe_error_events"][0]["exception_type"], "AccessDenied"
        )
        self.assertNotIn("private@example.com", json.dumps(report))

    def test_utc_timestamp_is_normalized(self):
        parsed = parse_utc_timestamp("2026-10-26T03:06:00Z")
        self.assertEqual(parsed.isoformat(), "2026-10-26T03:06:00+00:00")

    def test_non_utc_offset_is_rejected(self):
        with self.assertRaisesRegex(ValueError, "UTC offset"):
            parse_utc_timestamp("2026-10-26T06:06:00+03:00")

    def test_error_summary_contains_only_exception_type(self):
        entry = {"reason": "request failed (AccessDenied): private@example.com"}
        self.assertEqual(safe_error_type(entry), "AccessDenied")


if __name__ == "__main__":
    unittest.main()
