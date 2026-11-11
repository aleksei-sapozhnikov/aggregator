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

    def test_late_opened_pr_still_waits_60_actual_minutes_before_merge(self):
        client = MagicMock()
        client.repo = "aleksei-sapozhnikov/aggregator"
        late_pr = pr_data()
        late_pr["created_at"] = "2026-11-10T11:00:00Z"
        client.pr.return_value = late_pr
        with self.assertRaisesRegex(
            pull_requests.Deferred, "created_at \\+ 60 minutes not reached"
        ):
            pull_requests.merge_pr(
                client, MagicMock(), {"minimum_actual_open_minutes": 60},
                {"branch": "service-layout"},
                now=datetime(2026, 11, 10, 11, 59, tzinfo=timezone.utc),
                known_head="a" * 40,
                known_number=351,
            )
        client.put.assert_not_called()

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



class PublisherBranchUpdateTests(unittest.TestCase):
    def client(self):
        client = MagicMock()
        client.repo = "aleksei-sapozhnikov/aggregator"
        client.open_pulls.return_value = []
        return client

    def merge(self, client, before_merge=None):
        return pull_requests.merge_pr(
            client, MagicMock(), {"minimum_actual_open_minutes": 60},
            {"branch": "service-layout"},
            now=datetime(2026, 11, 10, 12, tzinfo=timezone.utc),
            known_head="a" * 40, known_number=351,
            queue_branches={"service-layout"},
            before_merge=before_merge,
        )

    def test_behind_branch_updates_then_squash_merges_in_same_invocation(self):
        client = self.client()
        behind = {**pr_data(), "mergeable_state": "behind"}
        updated = {**pr_data("b" * 40), "mergeable_state": "clean"}
        client.pr.side_effect = [
            pr_data(), pr_data(), behind, behind,
            updated, pr_data("b" * 40, merged=True),
        ]
        requests = []

        def put(path, body):
            requests.append((path, body))
            if path == "/pulls/351/update-branch":
                return {"message": "Updating pull request branch."}
            if len(requests) == 1:
                raise GitHubError(405, "Branch must be up to date")
            return {"merged": True, "sha": "e" * 40}

        client.put.side_effect = put
        attempts = []
        with patch.object(pull_requests.time, "sleep") as sleep:
            _pr, merged = self.merge(client, attempts.append)
        self.assertEqual("b" * 40, merged["head_sha"])
        self.assertEqual(["a" * 40, "b" * 40], attempts)
        self.assertEqual([
            ("/pulls/351/merge", {
                "merge_method": "squash", "sha": "a" * 40,
            }),
            ("/pulls/351/update-branch", {
                "expected_head_sha": "a" * 40,
            }),
            ("/pulls/351/merge", {
                "merge_method": "squash", "sha": "b" * 40,
            }),
        ], requests)
        sleep.assert_called_once_with(3)
        client.checks.assert_not_called()
        client.status.assert_not_called()
        client.reviews.assert_not_called()

    def test_blocked_checks_do_not_trigger_branch_update(self):
        client = self.client()
        client.pr.side_effect = [
            pr_data(), pr_data(),
            {**pr_data(), "mergeable_state": "blocked"},
        ]
        client.put.side_effect = GitHubError(405, "Checks not complete")
        with self.assertRaisesRegex(
            pull_requests.MergeNotReady, "branch update is not indicated"
        ):
            self.merge(client)
        client.put.assert_called_once_with(
            "/pulls/351/merge",
            {"merge_method": "squash", "sha": "a" * 40},
        )
        client.checks.assert_not_called()

    def test_conflicted_branch_does_not_trigger_branch_update(self):
        client = self.client()
        client.pr.side_effect = [
            pr_data(), pr_data(),
            {**pr_data(), "mergeable_state": "dirty"},
        ]
        client.put.side_effect = GitHubError(405, "Conflicts")
        with self.assertRaises(pull_requests.MergeNotReady):
            self.merge(client)
        client.put.assert_called_once()

    def test_operator_push_after_merge_refusal_is_preserved(self):
        client = self.client()
        client.pr.side_effect = [
            pr_data(), pr_data(),
            {**pr_data("b" * 40), "mergeable_state": "behind"},
        ]
        client.put.side_effect = GitHubError(409, "SHA changed")
        with self.assertRaisesRegex(
            pull_requests.MergeNotReady, "PR head changed"
        ):
            self.merge(client)
        client.put.assert_called_once()

    def test_accepted_update_times_out_after_thirty_seconds(self):
        client = self.client()
        behind = {**pr_data(), "mergeable_state": "behind"}
        client.pr.side_effect = [pr_data(), pr_data(), behind]
        client.pr.return_value = behind

        def get_pr(_number):
            if client.pr.call_count <= 3:
                return [pr_data(), pr_data(), behind][client.pr.call_count - 1]
            return behind

        client.pr.side_effect = get_pr
        client.put.side_effect = [
            GitHubError(405, "Behind"),
            {"message": "Updating pull request branch."},
        ]
        clock = [0.0]
        slept = []

        def advance(duration):
            slept.append(duration)
            clock[0] += duration

        with (
            patch.object(pull_requests.time, "monotonic", side_effect=lambda: clock[0]),
            patch.object(pull_requests.time, "sleep", side_effect=advance),
        ):
            with self.assertRaisesRegex(
                pull_requests.MergeNotReady, "pending after 30 seconds"
            ):
                self.merge(client)
        self.assertEqual(30.0, sum(slept))
        self.assertEqual(2, client.put.call_count)
        self.assertEqual(
            "/pulls/351/update-branch", client.put.call_args_list[1].args[0]
        )

    def test_update_conflict_is_reported_without_repeating(self):
        client = self.client()
        behind = {**pr_data(), "mergeable_state": "behind"}
        client.pr.side_effect = [pr_data(), pr_data(), behind, behind]
        client.put.side_effect = [
            GitHubError(405, "Behind"), GitHubError(422, "Update conflict"),
        ]
        with self.assertRaisesRegex(
            pull_requests.MergeNotReady, "automatic branch update"
        ):
            self.merge(client)
        self.assertEqual(2, client.put.call_count)

    def test_second_merge_rejection_does_not_request_second_update(self):
        client = self.client()
        behind = {**pr_data(), "mergeable_state": "behind"}
        client.pr.side_effect = [pr_data(), pr_data(), behind, pr_data("b" * 40)]
        client.put.side_effect = [
            GitHubError(405, "Behind"),
            {"message": "Updating pull request branch."},
            GitHubError(405, "Checks pending"),
        ]
        with self.assertRaisesRegex(
            pull_requests.MergeNotReady, "merge after branch update"
        ):
            self.merge(client)
        self.assertEqual(3, client.put.call_count)
        self.assertEqual(
            ["/pulls/351/merge", "/pulls/351/update-branch", "/pulls/351/merge"],
            [call.args[0] for call in client.put.call_args_list],
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
