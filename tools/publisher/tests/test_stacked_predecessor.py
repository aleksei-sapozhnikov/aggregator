"""Regression tests for stacked Publisher branches after a cherry-picked PR."""

import sys
import unittest
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "runtime" / "src"))

from lambda_publisher.github import rebase


class BranchClient:
    def __init__(self, refs):
        self.refs = refs

    def branch(self, name):
        return {"commit": {"sha": self.refs[name]}}


class StackedPredecessorTests(unittest.TestCase):
    def setUp(self):
        self.source_predecessor = "a" * 40
        self.merged_pr_head = "b" * 40
        self.source_successor = "c" * 40
        self.main_head = "d" * 40
        self.prepared_successor = "e" * 40
        self.client = BranchClient({
            "ui-runtime": self.source_predecessor,
            "service-layout": self.source_successor,
            "main": self.main_head,
        })
        self.row = {
            "branch": "service-layout",
            "depends_on": "ui-runtime",
            "expected_source_commits": 1,
        }
        self.predecessor_record = {
            "head_sha": self.merged_pr_head,
            "merge_sha": "f" * 40,
        }

    def test_accepts_original_source_branch_after_predecessor_cherry_pick(self):
        record = {}
        saves = []

        def build(client, **kwargs):
            self.assertEqual(self.source_predecessor, kwargs["predecessor_sha"])
            self.assertEqual(self.source_successor, kwargs["source_sha"])
            self.assertEqual(self.main_head, kwargs["main_sha"])
            return self.prepared_successor, "0" * 40

        def update(client, branch, old_sha, new_sha):
            self.assertEqual("service-layout", branch)
            self.assertEqual(self.source_successor, old_sha)
            self.assertEqual(self.prepared_successor, new_sha)
            self.client.refs[branch] = new_sha

        with (
            patch.object(rebase, "_commit"),
            patch.object(rebase, "source_commits", return_value=[("source", {})]) as ancestry,
            patch.object(rebase, "build_rebase", side_effect=build) as prepare,
            patch.object(rebase, "update_branch_with_lease", side_effect=update),
        ):
            result = rebase.prepare(
                self.client,
                self.row,
                record,
                self.predecessor_record,
                save=lambda: saves.append(record.copy()),
            )

        self.assertEqual(self.prepared_successor, result)
        ancestry.assert_called_once_with(
            self.client, self.source_predecessor, self.source_successor, 1
        )
        prepare.assert_called_once()
        self.assertEqual(self.source_predecessor, record["source_base_sha"])
        self.assertEqual(self.merged_pr_head, self.predecessor_record["head_sha"])
        self.assertEqual(self.prepared_successor, record["prepared_head_sha"])
        self.assertTrue(saves)

    def test_rejects_unrelated_successor_without_updating_git_refs(self):
        with (
            patch.object(rebase, "_commit"),
            patch.object(
                rebase, "source_commits", side_effect=RuntimeError("unrelated")
            ),
            patch.object(rebase, "build_rebase") as build,
            patch.object(rebase, "update_branch_with_lease") as update,
        ):
            with self.assertRaisesRegex(
                RuntimeError, "source branch does not descend"
            ):
                rebase.prepare(
                    self.client, self.row, {}, self.predecessor_record, save=lambda: None
                )
            build.assert_not_called()
            update.assert_not_called()


if __name__ == "__main__":
    unittest.main()
