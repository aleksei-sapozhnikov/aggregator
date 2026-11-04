"""Offline tests for human-readable plans and HTML rendering."""

import json
import sys
import tempfile
import unittest
from datetime import UTC, datetime
from pathlib import Path
from unittest.mock import MagicMock, patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "runtime" / "src"))
from html_calendar import render
from lambda_publisher.publication.snapshot_runner import Runner, allowed_start
from plan import compile_plan
from publisher import _validate_history


def sample():
    return {
        "timezone": "Europe/Belgrade",
        "previous_published_tag": "v0.7.13",
        "start_date": "2026-11-10",
        "end_date": "2026-11-12",
        "pull_requests": [
            {
                "branch": "test/one",
                "release": "v0.8.0",
                "title": "UI boundaries",
                "body": "- Implementation\n\n## Result\n- Verified",
                "open": "2026-11-10 09:00",
                "merge": "2026-11-10 11:30",
            },
            {
                "branch": "version/v0.8.0",
                "release": "v0.8.0",
                "title": "Release 0.8.0",
                "body": "- Version bump\n\n## Result\n- Versioned",
                "open": "2026-11-10 14:00",
                "merge": "2026-11-10 16:30",
            },
        ],
        "releases": {
            "v0.8.0": {"title": "Release 0.8.0", "notes": "## Features\n- UI"}
        },
    }


class PublisherTests(unittest.TestCase):
    def build(self, plan):
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp) / "plan.json"
            path.write_text(json.dumps(plan), encoding="utf-8")
            return compile_plan(path)

    def test_snapshot_and_html(self):
        snapshot = self.build(sample())
        self.assertEqual(4, len(snapshot["schedule"]["events"]))
        self.assertEqual("publisher-001-open", snapshot["schedule"]["events"][0]["id"])
        self.assertEqual("test/one", snapshot["queue"]["entries"][1]["depends_on"])
        output = render(
            snapshot,
            {"completed": ["publisher-001-open"], "prs": {"1": {"number": 123}}},
            paused=False,
            checked_at=datetime(2026, 11, 10, 9, tzinfo=UTC),
        )
        self.assertIn("Open", output)
        self.assertIn("/pull/123", output)
        self.assertIn("16:30", output)

    def test_five_merges_in_one_day_are_valid(self):
        plan = sample()
        opens = ("09:00", "10:40", "12:20", "14:00", "15:40")
        merges = ("10:15", "11:55", "13:35", "15:15", "16:55")
        plan["pull_requests"] = [
            {
                "branch": f"test/part-{index}" if index < 5 else "version/v0.8.0",
                "release": "v0.8.0",
                "title": f"Part {index}",
                "body": "- Implementation\n\n## Result\n- Verified",
                "open": f"2026-11-10 {opened}",
                "merge": f"2026-11-10 {merged}",
            }
            for index, (opened, merged) in enumerate(zip(opens, merges), start=1)
        ]
        snapshot = self.build(plan)
        self.assertEqual(5, len(snapshot["queue"]["entries"]))
        self.assertEqual(10, len(snapshot["schedule"]["events"]))
        self.assertNotIn("maximum_merges_per_day", snapshot["config"])

    def test_execution_window_differs_from_planning_window(self):
        config = self.build(sample())["config"]
        self.assertEqual("20:30", config["start_window"]["through"])
        self.assertEqual("22:00", config["execution_window"]["through"])
        for local_hour, expected in (
            ("09:00", True),
            ("20:30", True),
            ("20:45", True),
            ("21:01", True),
            ("22:00", True),
            ("22:05", False),
        ):
            with self.subTest(local_hour=local_hour):
                now = datetime.fromisoformat(f"2026-11-10T{local_hour}:00+01:00")
                self.assertEqual(expected, allowed_start(now, config))

    def test_overdue_event_executes_before_22(self):
        snapshot = self.build(sample())
        state = MagicMock()
        progress = {"completed": []}
        state.acquire.return_value = {
            "activated": True,
            "paused": False,
            "activation_all": True,
            "progress": progress,
        }
        runner = Runner(
            snapshot["config"],
            snapshot["queue"],
            snapshot["schedule"],
            snapshot["releases"],
            MagicMock(),
            MagicMock(),
            state,
        )
        with (
            patch.dict("os.environ", {"ACTIVATION_ENABLED": "true"}),
            patch.object(
                runner, "_execute", return_value={"verified": True}
            ) as execute,
        ):
            now = datetime.fromisoformat("2026-11-10T21:01:00+01:00")
            result = runner.run(dry_run=False, now=now, reconcile=True)
        self.assertEqual("completed", result["status"])
        self.assertEqual(["publisher-001-open"], progress["completed"])
        execute.assert_called_once()
        state.save.assert_called_once()

    def test_overdue_event_defers_after_22_except_at_final_cutoff(self):
        snapshot = self.build(sample())
        state = MagicMock()
        progress = {"completed": []}
        state.read.return_value = {"progress": progress}
        state.acquire.return_value = {"progress": progress}
        runner = Runner(
            snapshot["config"],
            snapshot["queue"],
            snapshot["schedule"],
            snapshot["releases"],
            MagicMock(),
            MagicMock(),
            state,
        )
        with (
            patch.dict("os.environ", {"ACTIVATION_ENABLED": "true"}),
            patch.object(runner, "_execute") as execute,
        ):
            today = runner.run(
                dry_run=False,
                reconcile=True,
                now=datetime.fromisoformat("2026-11-10T22:05:00+01:00"),
            )
            deadline = runner.run(
                dry_run=False,
                reconcile=True,
                now=datetime.fromisoformat("2026-11-12T22:05:00+01:00"),
            )
        self.assertEqual("deferred", today["status"])
        self.assertEqual("deadline_missed", deadline["status"])
        state.pause_owned.assert_called_once()
        execute.assert_not_called()

    def test_existing_snapshot_uses_legacy_execution_window(self):
        config = self.build(sample())["config"]
        config.pop("execution_window")
        self.assertFalse(
            allowed_start(datetime.fromisoformat("2026-11-10T21:01:00+01:00"), config)
        )

    def test_completed_event_is_immutable(self):
        old = self.build(sample())
        new_plan = sample()
        new_plan["pull_requests"][0]["open"] = "2026-11-10 09:15"
        new = self.build(new_plan)
        with self.assertRaisesRegex(RuntimeError, "cannot reschedule"):
            _validate_history(old, new, ["publisher-001-open"])

    def test_reject_dst_gap(self):
        plan = sample()
        plan["start_date"] = "2027-03-01"
        plan["end_date"] = "2027-03-31"
        plan["pull_requests"][0]["open"] = "2027-03-28 02:30"
        with self.assertRaisesRegex(ValueError, "time"):
            self.build(plan)

    def test_reject_unordered(self):
        plan = sample()
        plan["pull_requests"][1]["open"] = "2026-11-10 10:00"
        with self.assertRaisesRegex(ValueError, "after previous merge"):
            self.build(plan)

    def test_html_escapes_titles(self):
        plan = sample()
        plan["pull_requests"][0]["title"] = "<script>alert(1)</script>"
        result = render(self.build(plan))
        self.assertIn("&lt;script&gt;", result)
        self.assertNotIn("<script>", result)


if __name__ == "__main__":
    unittest.main()
