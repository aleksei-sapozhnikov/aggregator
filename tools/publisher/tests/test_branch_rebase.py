"""Test guarded in-Lambda Git rebases with mocks and local bare repositories."""

from __future__ import annotations

import shutil
import subprocess
import sys
import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path
from unittest.mock import MagicMock, patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "runtime" / "src"))

from lambda_publisher.github import branch_rebase
from lambda_publisher.github.github_client import Retryable


class BranchRebaseTests(unittest.TestCase):
    def setUp(self):
        self.client = MagicMock()
        self.client.repo = "aleksei-sapozhnikov/aggregator"
        self.client.token = "secret-token"
        self.head = "a" * 40
        self.main = "b" * 40
        self.client.branch.side_effect = lambda name: {
            "commit": {"sha": self.main if name == "main" else self.head}
        }
        self.client.compare.return_value = {"ahead_by": 16, "behind_by": 4}
        self.row = {
            "branch": "infrastructure-ownership",
            "expected_source_commits": 1,
        }
        self.record = {}
        self.save = MagicMock()
        self.now = datetime(2026, 11, 11, 12, tzinfo=timezone.utc)

    def ensure(self):
        branch_rebase.ensure_clean_branch(
            self.client, self.row, self.record,
            save=self.save, now=self.now,
        )

    def test_clean_branch_needs_no_git(self):
        self.client.compare.return_value = {"ahead_by": 1, "behind_by": 0}
        with patch.object(branch_rebase, "rebase_source_branch") as rebase:
            self.ensure()
        rebase.assert_not_called()
        self.save.assert_not_called()

    def test_rebase_rewrites_only_owned_suffix(self):
        new_head = "c" * 40
        self.client.branch.side_effect = [
            {"commit": {"sha": self.head}},
            {"commit": {"sha": self.main}},
            {"commit": {"sha": new_head}},
            {"commit": {"sha": self.main}},
        ]
        with patch.object(
            branch_rebase, "rebase_source_branch", return_value=new_head
        ) as rebase:
            self.ensure()
        rebase.assert_called_once_with(
            self.client.repo, "infrastructure-ownership",
            self.head, self.main, 1, "secret-token",
        )
        self.assertEqual(new_head, self.record["head_sha"])
        self.assertEqual(self.head, self.record["rebase"]["previous_head"])
        self.save.assert_called_once()

    def test_unverified_push_does_not_record_success(self):
        with patch.object(
            branch_rebase, "rebase_source_branch", return_value="c" * 40
        ):
            with self.assertRaisesRegex(Retryable, "could not be verified"):
                self.ensure()
        self.save.assert_not_called()

    def test_source_shorter_than_expected_is_rejected(self):
        self.client.compare.return_value = {"ahead_by": 0, "behind_by": 1}
        with self.assertRaisesRegex(Retryable, "fewer commits"):
            self.ensure()
        self.save.assert_not_called()

    def test_bad_commit_count_and_branch_are_rejected(self):
        self.row["expected_source_commits"] = 0
        with self.assertRaisesRegex(ValueError, "expected_source_commits"):
            self.ensure()
        with self.assertRaises(ValueError):
            branch_rebase._valid_inputs(
                "main", self.head, self.main, 1
            )
        with self.assertRaises(ValueError):
            branch_rebase._valid_inputs(
                "--upload-pack=evil", self.head, self.main, 1
            )


@unittest.skipUnless(shutil.which("git"), "Git required for local integration tests")
class LocalGitRebaseTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.remote = self.root / "remote.git"
        self.work = self.root / "working"
        self.git("init", "--bare", str(self.remote), cwd=self.root)
        self.git("init", "-b", "main", str(self.work), cwd=self.root)
        self.git("config", "user.email", "publisher-test@example.com")
        self.git("config", "user.name", "Publisher Test")
        self.git("remote", "add", "origin", str(self.remote))
        (self.work / "base.txt").write_text("base\n", encoding="utf-8")
        self.git("add", ".")
        self.git("commit", "-m", "Base")
        self.git("push", "-u", "origin", "main")

    def git(self, *args, cwd=None):
        proc = subprocess.run(
            ["git", *args], cwd=cwd or self.work,
            capture_output=True, text=True, check=False,
        )
        if proc.returncode:
            raise AssertionError(f"Git test setup failed: {args[0]}")
        return proc.stdout.strip()

    def common_history(self):
        self.git("switch", "-c", "source")
        (self.work / "previous.txt").write_text("previous\n", encoding="utf-8")
        self.git("add", ".")
        self.git("commit", "-m", "Previous PR")
        previous = self.git("rev-parse", "HEAD")
        (self.work / "owned.txt").write_text("owned\n", encoding="utf-8")
        self.git("add", ".")
        self.git("commit", "-m", "This PR")
        head = self.git("rev-parse", "HEAD")
        self.git("push", "-u", "origin", "source")
        self.git("switch", "main")
        self.git("cherry-pick", previous)
        self.git("commit", "--amend", "-m", "Previous PR squashed")
        (self.work / "other.txt").write_text("main changed\n", encoding="utf-8")
        self.git("add", ".")
        self.git("commit", "-m", "Other merged PR")
        base = self.git("rev-parse", "HEAD")
        self.git("push", "origin", "main")
        return head, base

    def test_rebase_removes_stacked_history_and_preserves_owned_patch(self):
        head, base = self.common_history()
        rewritten = branch_rebase.rebase_source_branch(
            "aleksei-sapozhnikov/aggregator", "source", head, base, 1,
            "test-token", remote_url=str(self.remote),
        )
        self.git("fetch", "origin", "source")
        self.assertEqual(rewritten, self.git("rev-parse", "origin/source"))
        self.assertEqual("1", self.git("rev-list", "--count", f"{base}..{rewritten}"))
        self.git("merge-base", "--is-ancestor", base, rewritten)
        self.assertEqual("owned\n", self.git("show", f"{rewritten}:owned.txt") + "\n")

    def test_conflict_does_not_modify_remote_branch(self):
        head, base = self.common_history()
        self.git("switch", "main")
        (self.work / "owned.txt").write_text("main version\n", encoding="utf-8")
        self.git("add", ".")
        self.git("commit", "-m", "Conflicting main change")
        base = self.git("rev-parse", "HEAD")
        self.git("push", "origin", "main")
        with self.assertRaises(Retryable):
            branch_rebase.rebase_source_branch(
                "aleksei-sapozhnikov/aggregator", "source",
                head, base, 1, "test-token", remote_url=str(self.remote),
            )
        self.assertEqual(
            head,
            self.git("ls-remote", str(self.remote), "refs/heads/source").split()[0],
        )


if __name__ == "__main__":
    unittest.main()
