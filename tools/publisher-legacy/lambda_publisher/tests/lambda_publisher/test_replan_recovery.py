"""Regression tests for explicitly recovering missed publication operations."""

from __future__ import annotations

import json
import tempfile
import unittest
from datetime import date, datetime
from pathlib import Path
from unittest.mock import patch

from lambda_publisher.publication.replan import replan

MODULE = "lambda_publisher.publication.replan"


class MissedEventRecoveryTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.root = Path(self.directory.name) / "data"
        self.root.mkdir()
        config = {
            "timezone": "Europe/Belgrade",
            "event_prefix": "aggregator",
            "start_window": {"from": "09:00", "through": "20:30"},
            "start_date": "2026-10-14",
            "end_date": "2026-11-05",
            "minimum_planned_open_minutes": 90,
            "maximum_merges_per_day": 4,
            "post_release_open_minutes": 40,
            "final_version_merge_latest_local": "18:30",
        }
        (self.root / "config.yaml").write_text(json.dumps(config), encoding="utf-8")
        (self.root / "publication-plan.csv").write_text("mocked", encoding="utf-8")
        self.rows = [
            {
                "id": "59",
                "branch": "version/v0.7.10",
                "release": "v0.7.10",
                "open_at": "2026-11-02T09:00:00+01:00",
                "merge_at": "2026-11-02T10:30:00+01:00",
            },
            {
                "id": "60",
                "branch": "qa-improve/ui-feature-boundaries",
                "release": "v0.7.11",
                "open_at": "2026-11-02T11:10:00+01:00",
                "merge_at": "2026-11-02T12:40:00+01:00",
            },
            {
                "id": "61",
                "branch": "qa-improve/ui-state-hooks",
                "release": "v0.7.11",
                "open_at": "2026-11-03T09:00:00+01:00",
                "merge_at": "2026-11-03T10:30:00+01:00",
            },
        ]
        self.previous = {
            "history": {"events": []},
            "queue": {
                "entries": [
                    {"id": int(row["id"]), "branch": row["branch"], "release": row["release"]}
                    for row in self.rows
                ]
            },
            "schedule": {
                "events": [
                    {
                        "id": f"aggregator-{int(row['id']):03d}-{suffix}",
                        "queue_id": int(row["id"]),
                        "local": row[cell],
                    }
                    for row in self.rows
                    for suffix, cell in (("open", "open_at"), ("merge", "merge_at"))
                ]
            },
        }
        self.progress = {
            "completed": ["aggregator-059-open", "aggregator-059-merge"]
        }

    def _compile(self, *_args, **_kwargs):
        return {
            "queue": self.previous["queue"],
            "schedule": {
                "events": [
                    {"id": f"aggregator-{int(row['id']):03d}-{suffix}", "local": row[cell]}
                    for row in self.rows
                    for suffix, cell in (("open", "open_at"), ("merge", "merge_at"))
                ]
            },
        }

    def _replan(self, *, recover=False):
        with (
            patch(f"{MODULE}.read_plan", return_value=self.rows),
            patch(f"{MODULE}.plan_csv", return_value=b"mocked"),
            patch(f"{MODULE}.compile_sources", side_effect=self._compile),
        ):
            return replan(
                self.root,
                self.previous,
                self.progress,
                today=date(2026, 11, 3),
                deadline=date(2026, 11, 5),
                recover_missed_events=recover,
            )

    def test_missed_event_is_rejected_by_default(self):
        with self.assertRaisesRegex(
            ValueError, "missed unfinished event requires reconciliation: aggregator-060-open"
        ):
            self._replan()

    def test_explicit_recovery_moves_missed_and_today_pending_operations(self):
        result = self._replan(recover=True)
        self.assertEqual(
            result["recovered_missed_events"],
            ["aggregator-060-open", "aggregator-060-merge"],
        )
        self.assertEqual(
            [item["id"] for item in result["rescheduled"]],
            [
                "aggregator-060-open",
                "aggregator-060-merge",
                "aggregator-061-open",
                "aggregator-061-merge",
            ],
        )
        self.assertEqual(
            result["protected"], ["aggregator-059-open", "aggregator-059-merge"]
        )
        self.assertEqual(self.rows[0]["merge_at"], "2026-11-02T10:30:00+01:00")
        times = [
            datetime.fromisoformat(row[cell])
            for row in self.rows[1:]
            for cell in ("open_at", "merge_at")
        ]
        self.assertTrue(all(instant.date() >= date(2026, 11, 4) for instant in times))
        self.assertEqual(times, sorted(times))

    def test_recovery_refuses_completed_event_after_unfinished_event(self):
        self.progress["completed"].append("aggregator-061-open")
        with self.assertRaisesRegex(
            ValueError, "protected operation appears after a movable operation"
        ):
            self._replan(recover=True)


if __name__ == "__main__":
    unittest.main()
