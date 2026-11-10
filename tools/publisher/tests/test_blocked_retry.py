"""Validate explicit same-day retries of blocked Publisher events."""

import sys
import unittest
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "runtime" / "src"))

from publisher import _validate_blocked_retry


class BlockedRetryTests(unittest.TestCase):
    def setUp(self):
        self.event_id = "publisher-002-open"
        self.snapshot = {
            "config": {
                "timezone": "Europe/Belgrade",
                "start_date": "2026-11-10",
                "end_date": "2026-11-30",
                "start_window": {"from": "09:00", "through": "20:30"},
                "execution_window": {"from": "09:00", "through": "22:00"},
            },
            "schedule": {
                "events": [
                    {
                        "id": self.event_id,
                        "utc": "2026-11-10T08:00:00Z",
                    }
                ],
            },
        }
        self.progress = {
            "completed": [],
            "errors": [{"event_id": self.event_id}],
        }

    def test_retries_blocked_event_later_on_scheduled_day(self):
        self.assertEqual(
            self.event_id,
            _validate_blocked_retry(
                self.snapshot,
                self.progress,
                now=datetime.fromisoformat("2026-11-10T10:37:00+01:00"),
            ),
        )

    def test_rejects_retry_on_a_later_day(self):
        with self.assertRaisesRegex(RuntimeError, "scheduled day"):
            _validate_blocked_retry(
                self.snapshot,
                self.progress,
                now=datetime.fromisoformat("2026-11-11T10:37:00+01:00"),
            )

    def test_rejects_retry_outside_execution_window(self):
        with self.assertRaisesRegex(RuntimeError, "execution window"):
            _validate_blocked_retry(
                self.snapshot,
                self.progress,
                now=datetime.fromisoformat("2026-11-10T22:05:00+01:00"),
            )

    def test_rejects_unrecorded_block(self):
        self.progress["errors"] = [{"event_id": "publisher-001-open"}]
        with self.assertRaisesRegex(RuntimeError, "no matching recorded block"):
            _validate_blocked_retry(
                self.snapshot,
                self.progress,
                now=datetime.fromisoformat("2026-11-10T10:37:00+01:00"),
            )


if __name__ == "__main__":
    unittest.main()
