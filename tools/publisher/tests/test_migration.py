"""Migration must preserve completed PRs and releases without replaying them."""

import copy
import io
import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "runtime" / "src"))

from migration import migrate_progress
from plan import compile_plan
import publisher
from lambda_publisher.publication.publication import canonical, digest


def make_snapshots():
    prs = [
        ("first-feature", "v0.8.5", "First", "2027-11-26 09:00", "2027-11-26 10:30"),
        ("version/v0.8.5", "v0.8.5", "Version 5", "2027-11-27 09:00", "2027-11-27 10:30"),
        ("second-feature", "v0.8.6", "Second", "2027-11-28 09:00", "2027-11-28 10:30"),
        ("version/v0.8.6", "v0.8.6", "Version 6", "2027-11-29 09:00", "2027-11-29 10:30"),
    ]
    common = {"timezone": "Europe/Belgrade", "start_date": "2027-11-26", "end_date": "2027-11-29"}
    release_info = {
        "v0.8.5": {"title": "Release Five", "notes": "## Features\n- First feature"},
        "v0.8.6": {"title": "Release Six", "notes": "## Features\n- Second feature"},
    }
    legacy = {
        **common, "previous_published_tag": "v0.8.4",
        "pull_requests": [
            {
                "branch": branch, "release": tag, "title": title,
                "body": "- Changes.\n\n## Result\n- Done.",
                "open": opened, "merge": merged,
                "expected_source_commits": 2,
            }
            for branch, tag, title, opened, merged in prs
        ],
        "releases": release_info,
    }
    operations = []
    for branch, tag, title, opened, merged in prs:
        operations.append({
            "type": "pull_request", "branch": branch, "title": title,
            "body": "- Changes.\n\n## Result\n- Done.",
            "open": opened, "merge": merged, "expected_source_commits": 2,
        })
        if branch == "version/" + tag:
            operations.append({
                "type": "release", "tag": tag,
                "title": release_info[tag]["title"],
                "notes": release_info[tag]["notes"],
                "publish": merged[:11] + "11:00",
            })
    proposed = {**common, "operations": operations}
    with tempfile.TemporaryDirectory() as dirname:
        path = Path(dirname) / "plan.json"
        path.write_text(json.dumps(legacy), encoding="utf-8")
        old = compile_plan(path)
        path.write_text(json.dumps(proposed), encoding="utf-8")
        new = compile_plan(path)
    return old, new


def starting_progress():
    return {
        "completed": [], "prs": {}, "releases": {}, "attempts": {},
        "alerts": [], "errors": [],
    }


class LegacyMigrationTests(unittest.TestCase):
    def setUp(self):
        self.old, self.new = make_snapshots()

    def test_migrates_empty_queue_without_completing_a_release(self):
        progress, boundary, summary = migrate_progress(
            self.old, self.new, starting_progress()
        )
        self.assertEqual([], progress["completed"])
        self.assertEqual("publisher-001-open", summary["next_event"])
        self.assertEqual(4, summary["mapped_prs"])
        self.assertEqual(0, summary["published_releases"])
        self.assertIsNone(boundary)

    def test_maps_completed_release_and_remaps_following_pr_id(self):
        state = starting_progress()
        state["completed"] = [
            event["id"] for event in self.old["schedule"]["events"][:5]
        ]
        state["releases"]["v0.8.5"] = {
            "sha": "a" * 40, "url": "https://github.com/example/releases/v0.8.5",
            "tag_created": True, "published": True, "milestone_closed": True,
        }
        state["prs"]["3"] = {"number": 352, "head_sha": "b" * 40}
        state["attempts"]["publisher-003-merge"] = 2
        state["errors"].append({
            "event_id": "publisher-003-merge", "reason": "GitHub pending"
        })
        translated, boundary, summary = migrate_progress(
            self.old, self.new, state, "publisher-003-merge"
        )
        self.assertEqual(6, len(translated["completed"]))
        self.assertIn("publisher-003-publish", translated["completed"])
        self.assertEqual("publisher-004-merge", summary["next_event"])
        self.assertEqual("publisher-004-merge", boundary)
        self.assertEqual(352, translated["prs"]["4"]["number"])
        self.assertNotIn("3", translated["prs"])
        self.assertEqual(2, translated["attempts"]["publisher-004-merge"])
        self.assertEqual("publisher-004-merge", translated["errors"][0]["event_id"])
        self.assertEqual(1, summary["published_releases"])
        self.assertEqual(5, len(state["completed"]))

    def test_partial_open_preserves_number_and_progress(self):
        state = starting_progress()
        state["completed"] = [self.old["schedule"]["events"][0]["id"]]
        state["prs"]["1"] = {"number": 351, "head_sha": "b" * 40}
        translated, _, summary = migrate_progress(self.old, self.new, state)
        self.assertEqual(state["completed"], translated["completed"])
        self.assertEqual(351, translated["prs"]["1"]["number"])
        self.assertEqual("publisher-001-merge", summary["next_event"])

    def test_refuses_completed_version_merge_without_confirmed_release(self):
        state = starting_progress()
        state["completed"] = [
            event["id"] for event in self.old["schedule"]["events"][:4]
        ]
        with self.assertRaisesRegex(ValueError, "not durably published"):
            migrate_progress(self.old, self.new, state)

    def test_refuses_partially_published_release(self):
        state = starting_progress()
        state["completed"] = [
            event["id"] for event in self.old["schedule"]["events"][:3]
        ]
        state["releases"]["v0.8.5"] = {
            "sha": "a" * 40, "tag_created": True, "published": False,
        }
        with self.assertRaisesRegex(ValueError, "finish or reconcile"):
            migrate_progress(self.old, self.new, state)

    def test_rejects_changed_completed_pr_description(self):
        state = starting_progress()
        state["completed"] = [self.old["schedule"]["events"][0]["id"]]
        modified = copy.deepcopy(self.new)
        modified["queue"]["entries"][0]["body"] = "Modified"
        from lambda_publisher.publication.config import queue_digest
        modified["schedule"]["queue_sha256"] = queue_digest(modified["queue"])
        with self.assertRaisesRegex(ValueError, "changes body"):
            migrate_progress(self.old, modified, state)

    def test_rejects_reordered_prs(self):
        modified = copy.deepcopy(self.new)
        modified["queue"]["entries"].reverse()
        from lambda_publisher.publication.config import queue_digest
        modified["schedule"]["queue_sha256"] = queue_digest(modified["queue"])
        with self.assertRaisesRegex(ValueError, "ordered PR branches"):
            migrate_progress(self.old, modified, starting_progress())

    def test_rejects_rescheduled_completed_event(self):
        state = starting_progress()
        state["completed"] = [self.old["schedule"]["events"][0]["id"]]
        modified = copy.deepcopy(self.new)
        modified["schedule"]["events"][0]["utc"] = "2027-11-26T08:01:00Z"
        with self.assertRaisesRegex(ValueError, "completed event time changed"):
            migrate_progress(self.old, modified, state)

    def test_rejects_nonprefix_completed_progress(self):
        state = starting_progress()
        state["completed"] = [self.old["schedule"]["events"][1]["id"]]
        with self.assertRaisesRegex(ValueError, "ordered event prefix"):
            migrate_progress(self.old, self.new, state)

    def test_refuses_unknown_progress_id(self):
        state = starting_progress()
        state["prs"]["999"] = {"number": 555}
        with self.assertRaisesRegex(ValueError, "unrecognized legacy PR"):
            migrate_progress(self.old, self.new, state)


class MigrationCommandTests(unittest.TestCase):
    def setUp(self):
        self.old, self.new = make_snapshots()
        self.progress = starting_progress()
        self.table = MagicMock()
        self.s3 = MagicMock()
        self.s3.get_object.return_value = {"Body": io.BytesIO(canonical(self.new))}
        self.session = MagicMock()
        self.session.resource.return_value.Table.return_value = self.table
        self.session.client.return_value = self.s3
        self.item = {
            "pk": "QUEUE", "paused": True, "activated": True,
            "activation_all": True, "data_revision": "a" * 64,
            "progress": json.dumps(self.progress),
        }
        self.table.get_item.return_value = {"Item": self.item}

    def run_migration(self, apply=False):
        with (
            patch.object(publisher, "compile_plan", return_value=self.new),
            patch.object(publisher, "_session", return_value=self.session),
            patch.object(publisher, "load_snapshot", return_value=self.old),
            patch.object(publisher, "_enough_time"),
            patch.object(publisher, "_verify_remote_branches"),
        ):
            publisher.migrate(Path("unused.json"), "test", execute=apply)

    def test_preview_never_writes_aws_state(self):
        self.run_migration()
        self.table.update_item.assert_not_called()
        self.s3.put_object.assert_not_called()

    def test_apply_updates_progress_and_revision_atomically(self):
        self.run_migration(apply=True)
        self.table.update_item.assert_called_once()
        args = self.table.update_item.call_args.kwargs
        self.assertIn("data_revision=:new, progress=:newprogress", args["UpdateExpression"])
        self.assertIn("progress=:oldprogress", args["ConditionExpression"])
        self.assertEqual(self.item["progress"], args["ExpressionAttributeValues"][":oldprogress"])
        self.assertEqual(
            digest(canonical(self.new)),
            args["ExpressionAttributeValues"][":new"],
        )
        self.s3.put_object.assert_not_called()

    def test_requires_paused_queue(self):
        self.item["paused"] = False
        with self.assertRaisesRegex(RuntimeError, "pause"):
            self.run_migration(apply=True)
        self.table.update_item.assert_not_called()


if __name__ == "__main__":
    unittest.main()
