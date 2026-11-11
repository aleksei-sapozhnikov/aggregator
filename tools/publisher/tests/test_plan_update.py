"""Validate full plan replacement without replaying historical publications."""

import io
import json
import sys
import tempfile
import unittest
from contextlib import redirect_stdout
from unittest.mock import MagicMock, patch
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "runtime" / "src"))

from plan import compile_plan
from plan_update import reconcile_operations_plan
import publisher
from publisher import (
    _reconcile_future_progress,
    _validate_history,
    _validation_summary,
    _warn_due_soon,
)


def sample():
    return {
        "timezone": "Europe/Belgrade",
        "start_date": "2027-11-26",
        "end_date": "2027-11-27",
        "operations": [
            {
                "type": "pull_request", "branch": "first",
                "title": "First PR",
                "body": "- First change.\n\n## Result\n- First completed.",
                "open": "2027-11-26 09:00",
                "merge": "2027-11-26 10:30",
            },
            {
                "type": "release", "tag": "v1.0",
                "title": "First release", "notes": "## Features\n- First",
                "publish": "2027-11-26 11:00",
            },
            {
                "type": "pull_request", "branch": "second",
                "title": "Second PR",
                "body": "- Second change.\n\n## Result\n- Second completed.",
                "open": "2027-11-26 12:00",
                "merge": "2027-11-26 13:30",
            },
            {
                "type": "release", "tag": "v1.1",
                "title": "Second release", "notes": "## Features\n- Second",
                "publish": "2027-11-27 09:00",
            },
        ],
    }


class FullPlanReplacementTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.path = Path(self.temp.name) / "plan.json"
        self.old_plan = sample()
        self.old = self.compile(self.old_plan)
        self.done = {
            "completed": ["publisher-001-open", "publisher-001-merge"],
            "prs": {"1": {"number": 351, "head_sha": "a" * 40}},
            "releases": {},
        }

    def compile(self, plan):
        self.path.write_text(json.dumps(plan), encoding="utf-8")
        return compile_plan(self.path)

    def replace(self, plan, *, now="2027-11-26T10:35:00+01:00", progress=None):
        self.path.write_text(json.dumps(plan), encoding="utf-8")
        return reconcile_operations_plan(
            self.path, self.old, self.done if progress is None else progress,
            now=datetime.fromisoformat(now),
        )

    def test_completed_pr_changes_are_ignored_with_warning(self):
        plan = sample()
        plan["operations"][0]["title"] = "This title must not replace history"
        plan["operations"][0]["open"] = "2026-01-01 09:00"
        plan["operations"][0]["merge"] = "2026-01-01 10:30"
        snapshot, warnings = self.replace(plan)
        self.assertEqual("First PR", snapshot["queue"]["entries"][0]["title"])
        self.assertEqual(self.old["schedule"]["events"][:2],
                         snapshot["schedule"]["events"][:2])
        self.assertTrue(any("already started/completed" in text for text in warnings))
        _validate_history(self.old, snapshot, self.done["completed"], self.done)

    def test_missing_completed_pr_is_reconstructed_from_aws(self):
        plan = sample()
        del plan["operations"][0]
        snapshot, warnings = self.replace(plan)
        self.assertEqual("first", snapshot["queue"]["entries"][0]["branch"])
        self.assertEqual(6, len(snapshot["schedule"]["events"]))
        self.assertTrue(any("missing from JSON" in text for text in warnings))
        _validate_history(self.old, snapshot, self.done["completed"], self.done)

    def test_insert_and_reorder_future_operations(self):
        plan = sample()
        new = {
            "type": "pull_request", "branch": "inserted",
            "title": "Inserted PR",
            "body": "- Inserted change.\n\n## Result\n- Done.",
            "open": "2027-11-26 11:00",
            "merge": "2027-11-26 12:40",
        }
        plan["operations"].insert(1, new)
        plan["operations"][2]["publish"] = "2027-11-26 13:10"
        plan["operations"][3]["open"] = "2027-11-26 14:00"
        plan["operations"][3]["merge"] = "2027-11-26 16:00"
        snapshot, _ = self.replace(plan)
        self.assertEqual(
            ["first", "inserted", "second"],
            [row["branch"] for row in snapshot["queue"]["entries"]],
        )
        self.assertEqual(
            [1, 2, 4],
            [event["queue_id"] for event in snapshot["schedule"]["events"]
             if event["action"] == "merge_pr"],
        )
        self.assertEqual("publisher-003-publish",
                         snapshot["schedule"]["events"][4]["id"])
        _validate_history(self.old, snapshot, self.done["completed"], self.done)

    def test_unstarted_past_operations_remain_queued_with_warning(self):
        plan = sample()
        snapshot, warnings = self.replace(plan, now="2027-11-26T13:00:00+01:00")
        self.assertEqual(2, len(snapshot["queue"]["entries"]))
        self.assertEqual(2, len(snapshot["releases"]["releases"]))
        self.assertEqual(6, len(snapshot["schedule"]["events"]))
        self.assertEqual(self.done["completed"], [
            event["id"] for event in snapshot["schedule"]["events"][:2]
        ])
        self.assertTrue(any(
            "Retained 2 unstarted operations with past scheduled times" in text
            for text in warnings
        ))
        self.assertFalse(any("Skipped" in text for text in warnings))
        _validate_history(self.old, snapshot, self.done["completed"], self.done)

    def test_partial_open_pr_is_preserved(self):
        plan = sample()
        plan["operations"][0]["merge"] = "2027-11-26 12:30"
        progress = {
            "completed": ["publisher-001-open"],
            "prs": {"1": {"number": 351}},
        }
        snapshot, _ = self.replace(plan, now="2027-11-26T09:30:00+01:00",
                                   progress=progress)
        self.assertEqual("2027-11-26T10:30:00+01:00",
                         snapshot["schedule"]["events"][1]["local"])
        _validate_history(self.old, snapshot, progress["completed"], progress)

    def test_future_retry_records_are_not_attached_to_new_ids(self):
        progress = {
            **self.done,
            "prs": {
                **self.done["prs"],
                "2": {"milestone_number": 4},
            },
            "attempts": {"publisher-002-publish": 2},
            "errors": [{"event_id": "publisher-002-publish", "reason": "error"}],
            "alerts": [{"event_id": "publisher-002-publish", "reason": "alert"}],
        }
        plan = sample()
        plan["operations"][1]["publish"] = "2027-11-26 11:30"
        proposed, _ = self.replace(plan, progress=progress)
        cleaned = _reconcile_future_progress(self.old, proposed, progress)
        self.assertEqual({"1": self.done["prs"]["1"]}, cleaned["prs"])
        self.assertEqual({}, cleaned["attempts"])
        self.assertEqual([], cleaned["errors"])
        self.assertEqual([], cleaned["alerts"])

    def test_completed_release_notes_are_preserved_from_aws(self):
        progress = {
            "completed": [
                "publisher-001-open",
                "publisher-001-merge",
                "publisher-002-publish",
            ],
            "prs": self.done["prs"],
            "releases": {"v1.0": {"sha": "b" * 40, "published": True}},
        }
        plan = sample()
        plan["operations"][1]["notes"] = "## Changed after publication"
        snapshot, warnings = self.replace(
            plan, now="2027-11-26T11:10:00+01:00", progress=progress
        )
        self.assertEqual(
            "## Features\n- First",
            snapshot["releases"]["releases"][0]["notes"],
        )
        self.assertTrue(any("already started/completed" in text for text in warnings))
        _validate_history(self.old, snapshot, progress["completed"], progress)

    def test_overdue_next_event_only_warns_while_paused(self):
        snapshot = self.compile(sample())
        snapshot["schedule"]["events"][0]["utc"] = "2020-01-01T09:00:00Z"
        output = io.StringIO()
        with redirect_stdout(output):
            _warn_due_soon(snapshot, [])
        self.assertIn("WARNING", output.getvalue())
        self.assertIn("after resume", output.getvalue())

    def test_due_soon_warning_differs_from_overdue(self):
        snapshot = self.compile(sample())
        output = io.StringIO()
        with patch.object(publisher, "_next_due", return_value=(
            datetime.now(timezone.utc).replace(microsecond=0)
            + timedelta(minutes=10),
            "publisher-001-open",
        )), redirect_stdout(output):
            _warn_due_soon(snapshot, [])
        self.assertIn("due within 20 minutes", output.getvalue())
        self.assertNotIn("overdue", output.getvalue())

    def test_validate_lists_events_before_summary_and_warnings(self):
        self.path.write_text(json.dumps(sample()), encoding="utf-8")
        output = io.StringIO()
        with patch.object(
            publisher, "_validation_summary",
            return_value=["Valid: summary", "WARNING: local past events"],
        ), redirect_stdout(output):
            publisher.main(["validate", str(self.path)])
        lines = output.getvalue().splitlines()
        self.assertIn("publisher-004-publish", lines[-3])
        self.assertEqual("Valid: summary", lines[-2])
        self.assertEqual("WARNING: local past events", lines[-1])

    def test_validate_summary_marks_past_events_without_skipping(self):
        snapshot = self.compile(sample())
        lines = _validation_summary(
            snapshot, now=datetime.fromisoformat("2027-11-26T13:00:00+01:00")
        )
        self.assertIn("6 events", lines[0])
        self.assertTrue(any("times in the past" in line for line in lines[1:]))
        self.assertTrue(any("does not remove" in line for line in lines[1:]))

    def test_resume_warns_and_updates_queue_after_time_guard_refactor(self):
        session = MagicMock()
        table = MagicMock()
        table.get_item.return_value = {
            "Item": {
                "pk": "QUEUE",
                "data_revision": "test-revision",
                "paused": True,
                "progress": json.dumps({"completed": []}),
            }
        }
        session.resource.return_value.Table.return_value = table
        overdue_snapshot = {
            "schedule": {
                "events": [{
                    "id": "publisher-001-open",
                    "utc": "2020-01-01T09:00:00Z",
                }],
            },
        }
        with patch.object(publisher, "_session", return_value=session), \
                patch.object(publisher, "load_snapshot", return_value=overdue_snapshot), \
                patch.object(publisher, "_verify_remote_branches") as verify, \
                redirect_stdout(io.StringIO()) as output:
            publisher.set_paused(False, "test")
        self.assertIn("WARNING", output.getvalue())
        self.assertIn("Publisher ARMED", output.getvalue())
        verify.assert_called_once_with(overdue_snapshot, [])
        self.assertEqual(False, table.update_item.call_args.kwargs[
            "ExpressionAttributeValues"][":new"])

    def test_invalid_completed_progress_is_rejected(self):
        progress = {"completed": ["publisher-002-publish"]}
        with self.assertRaisesRegex(RuntimeError, "ordered prefix"):
            self.replace(sample(), progress=progress)


if __name__ == "__main__":
    unittest.main()
