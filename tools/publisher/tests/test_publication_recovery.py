"""Publisher should let GitHub merge queued PRs and recover without stopping."""

import os
import sys
import unittest
from datetime import datetime, timezone
from pathlib import Path
from unittest.mock import MagicMock, patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "runtime" / "src"))

from lambda_publisher.github import pull_requests
from lambda_publisher.github.github_client import GitHubError
from lambda_publisher.publication.snapshot_runner import Runner


def pr_data(head="a" * 40, *, merged=False):
    return {
        "number": 351,
        "title": "Service layout",
        "state": "closed" if merged else "open",
        "created_at": "2026-11-10T08:00:00Z",
        "merged_at": "2026-11-10T09:30:00Z" if merged else None,
        "merge_commit_sha": "e" * 40 if merged else None,
        "html_url": "https://github.com/aleksei-sapozhnikov/aggregator/pull/351",
        "head": {
            "ref": "service-layout",
            "sha": head,
            "repo": {"full_name": "aleksei-sapozhnikov/aggregator"},
        },
        "base": {
            "ref": "main",
            "repo": {"full_name": "aleksei-sapozhnikov/aggregator"},
        },
    }


def sample_runner():
    config = {
        "repository": "aleksei-sapozhnikov/aggregator",
        "base": "main",
        "timezone": "Europe/Belgrade",
        "start_date": "2026-11-10",
        "end_date": "2026-11-11",
        "start_window": {"from": "09:00", "through": "20:30"},
        "execution_window": {"from": "09:00", "through": "22:00"},
        "expected_actor": "aleksei-sapozhnikov",
        "project": {"url": "https://github.com/users/aleksei-sapozhnikov/projects/1"},
    }
    queue = {"repository": config["repository"], "entries": [{
        "id": 2, "branch": "service-layout",
        "depends_on": "ui-runtime", "release": "v0.8.0",
        "title": "Service layout", "body": "- Changes\n\n## Result\n- Updated layout",
    }]}
    from lambda_publisher.publication.config import queue_digest
    schedule = {
        "queue_sha256": queue_digest(queue),
        "events": [{
            "id": "publisher-002-open",
            "queue_id": 2,
            "action": "open_pr",
            "utc": "2026-11-10T08:00:00Z",
        }],
    }
    state = MagicMock()
    progress = {"completed": [], "prs": {}, "attempts": {}, "alerts": []}
    state.acquire.return_value = {
        "activated": True, "paused": False, "activation_all": True,
        "progress": progress,
    }
    repo = MagicMock()
    repo.repo = config["repository"]
    repo.identity.return_value = {"login": config["expected_actor"]}
    project = MagicMock()
    project.identity.return_value = {"login": config["expected_actor"]}
    runner = Runner(
        config, queue, schedule, {"releases": []}, repo, project, state,
    )
    return runner, repo, state, progress


class PublisherGitHubBehaviorTests(unittest.TestCase):
    def test_open_pr_does_not_attempt_metadata_before_returning_identity(self):
        client = MagicMock()
        client.repo = "aleksei-sapozhnikov/aggregator"
        client.find_prs.return_value = []
        client.open_pulls.return_value = []
        client.post.return_value = pr_data()
        row = {"branch": "service-layout", "title": "Service layout", "body": "body"}

        with patch.object(
            pull_requests, "reconcile_associations_best_effort",
            side_effect=AssertionError("metadata must run after durable commit"),
        ):
            opened, metadata = pull_requests.open_pr(
                client, MagicMock(), {}, row,
                queue_branches={"service-layout"},
                scheduled_at=datetime(2026, 11, 10, 8, tzinfo=timezone.utc),
            )
        self.assertEqual(351, opened["number"])
        self.assertEqual({}, metadata)
        client.post.assert_called_once()

    def test_merge_uses_latest_head_after_operator_push(self):
        client = MagicMock()
        client.repo = "aleksei-sapozhnikov/aggregator"
        client.pr.side_effect = [
            pr_data("b" * 40),
            pr_data("c" * 40),
            pr_data("c" * 40, merged=True),
        ]
        client.put.return_value = {"merged": True, "sha": "e" * 40}
        client.open_pulls.return_value = []
        row = {"branch": "service-layout"}
        sha_updates = []
        _merged, info = pull_requests.merge_pr(
            client, MagicMock(), {"minimum_actual_open_minutes": 60}, row,
            now=datetime(2026, 11, 10, 12, tzinfo=timezone.utc),
            known_head="a" * 40,
            known_number=351,
            queue_branches={"service-layout"},
            before_merge=sha_updates.append,
        )
        self.assertEqual("c" * 40, info["head_sha"])
        self.assertEqual(["c" * 40], sha_updates)
        client.put.assert_called_once_with(
            "/pulls/351/merge",
            {"merge_method": "squash", "sha": "c" * 40},
        )

    def test_reconcile_merge_from_github_after_lost_response(self):
        client = MagicMock()
        client.repo = "aleksei-sapozhnikov/aggregator"
        client.pr.return_value = pr_data("c" * 40, merged=True)
        merged, info = pull_requests.merge_pr(
            client, MagicMock(), {"minimum_actual_open_minutes": 60}, {"branch": "service-layout"},
            now=datetime(2026, 11, 10, 12, tzinfo=timezone.utc),
            known_head="a" * 40,
            known_number=351,
        )
        self.assertEqual("e" * 40, info["merge_sha"])
        client.put.assert_not_called()

    def test_github_merge_rejection_is_deferred(self):
        client = MagicMock()
        client.repo = "aleksei-sapozhnikov/aggregator"
        client.pr.return_value = pr_data()
        client.open_pulls.return_value = []
        client.put.side_effect = GitHubError(405, "PR cannot be merged")
        with self.assertRaises(pull_requests.MergeNotReady):
            pull_requests.merge_pr(
                client, MagicMock(), {"minimum_actual_open_minutes": 60},
                {"branch": "service-layout"},
                now=datetime(2026, 11, 10, 12, tzinfo=timezone.utc),
                known_head="a" * 40,
                known_number=351,
                queue_branches={"service-layout"},
            )


class PublisherRunnerBehaviorTests(unittest.TestCase):
    def test_open_pr_saves_identity_without_rebasing_predecessor(self):
        runner, repo, state, progress = sample_runner()
        repo.find_prs.return_value = []
        repo.open_pulls.return_value = []
        repo.post.return_value = pr_data()
        event = runner.schedule["events"][0]
        with patch.object(
            pull_requests, "reconcile_associations_best_effort",
            side_effect=AssertionError("metadata called before persistence"),
        ):
            result = runner._execute(
                event, progress, datetime(2026, 11, 10, 9, tzinfo=timezone.utc)
            )
        self.assertEqual({"pr": 351}, result)
        self.assertEqual(351, progress["prs"]["2"]["number"])
        state.save.assert_called_once_with(progress)

    def test_optional_metadata_error_does_not_rollback_completed_open(self):
        runner, repo, state, progress = sample_runner()
        with (
            patch.dict(os.environ, {"ACTIVATION_ENABLED": "true"}),
            patch.object(runner, "_execute", return_value={"pr": 351}),
            patch.object(
                pull_requests, "reconcile_associations_best_effort",
                side_effect=ModuleNotFoundError("test metadata import error"),
            ),
        ):
            result = runner.run(
                dry_run=False, reconcile=True,
                now=datetime(2026, 11, 10, 10, tzinfo=timezone.utc),
            )
        self.assertEqual("completed", result["status"])
        self.assertEqual(["publisher-002-open"], progress["completed"])
        state.pause_owned.assert_not_called()
        state.save.assert_called_once_with(progress)

    def test_repeated_runtime_errors_retry_without_pausing_queue(self):
        runner, repo, state, progress = sample_runner()
        with (
            patch.dict(os.environ, {"ACTIVATION_ENABLED": "true"}),
            patch.object(
                runner, "_execute", side_effect=ModuleNotFoundError("bad import")
            ),
            patch.object(runner, "_alert") as notify,
        ):
            results = [
                runner.run(
                    dry_run=False, reconcile=True,
                    now=datetime(2026, 11, 10, 10, tzinfo=timezone.utc),
                )
                for _ in range(4)
            ]
        self.assertTrue(all(r["status"] == "retryable" for r in results))
        self.assertEqual(4, progress["attempts"]["publisher-002-open"])
        self.assertEqual([], progress["completed"])
        self.assertEqual(2, notify.call_count)
        state.pause_owned.assert_not_called()

    def test_merge_deferral_never_blocks_following_order(self):
        runner, repo, state, progress = sample_runner()
        with (
            patch.dict(os.environ, {"ACTIVATION_ENABLED": "true"}),
            patch.object(
                runner, "_execute",
                side_effect=pull_requests.MergeNotReady("GitHub declined the merge"),
            ),
            patch.object(runner, "_alert") as notify,
        ):
            results = [
                runner.run(
                    dry_run=False, reconcile=True,
                    now=datetime(2026, 11, 10, 10, tzinfo=timezone.utc),
                )
                for _ in range(3)
            ]
        self.assertEqual("deferred", results[-1]["status"])
        self.assertEqual(3, progress["attempts"]["publisher-002-open"])
        self.assertEqual([], progress["completed"])
        notify.assert_called_once()
        state.pause_owned.assert_not_called()


if __name__ == "__main__":
    unittest.main()
