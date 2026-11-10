"""Verify that Publisher runtime notification paths work with the packaged layout."""

import os
import sys
import types
import unittest
from datetime import datetime, timezone
from pathlib import Path
from unittest.mock import MagicMock, patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "runtime" / "src"))

from lambda_publisher import handler
from lambda_publisher.github import pull_requests


class RuntimeNotificationsTests(unittest.TestCase):
    def test_open_pr_survives_milestone_and_project_warnings(self):
        client = MagicMock()
        client.repo = "aleksei-sapozhnikov/aggregator"
        project_client = MagicMock()
        row = {"branch": "service-layout", "title": "Service layout", "body": "body"}
        pr = {
            "number": 351,
            "state": "open",
            "head": {
                "ref": row["branch"],
                "sha": "a" * 40,
                "repo": {"full_name": client.repo},
            },
            "base": {"ref": "main", "repo": {"full_name": client.repo}},
        }

        with (
            patch.object(pull_requests, "find_exact", return_value=pr),
            patch.object(pull_requests, "ensure_only_queue_pr"),
            patch.object(
                pull_requests.milestones,
                "ensure_open",
                side_effect=RuntimeError("milestone unavailable"),
            ),
            patch.object(
                pull_requests.projects,
                "resolve",
                side_effect=RuntimeError("project unavailable"),
            ),
        ):
            opened, associations = pull_requests.open_pr(
                client,
                project_client,
                {},
                row,
                queue_branches={row["branch"]},
                scheduled_at=datetime(2026, 11, 10, 8, tzinfo=timezone.utc),
            )
            optional = pull_requests.reconcile_associations_best_effort(
                client, project_client, {}, row, opened
            )

        self.assertEqual(pr, opened)
        self.assertEqual({}, associations)
        self.assertEqual({}, optional)

    def test_bootstrap_failure_sends_notification(self):
        sns = MagicMock()
        boto3 = types.ModuleType("boto3")
        boto3.client = MagicMock(return_value=sns)
        event = {"event_id": "publisher-002-open", "data_revision": "revision",
                 "schedule_sha256": "digest"}
        context = types.SimpleNamespace(aws_request_id="request-123")
        with (
            patch.dict(
                os.environ,
                {
                    "NOTIFICATIONS_ENABLED": "true",
                    "SNS_TOPIC_ARN": "arn:aws:sns:eu-central-1:123456789012:alerts",
                },
            ),
            patch.dict(sys.modules, {"boto3": boto3}),
            patch.object(
                handler, "build_runner",
                side_effect=RuntimeError("bootstrap error"),
            ),
            patch.object(handler, "alert", return_value=True) as send_alert,
        ):
            with self.assertRaisesRegex(
                RuntimeError, "publication invocation failed"
            ):
                handler.lambda_handler(event, context)

        send_alert.assert_called_once()
        self.assertIs(send_alert.call_args.args[0], sns)
        self.assertEqual("publisher-002-open", send_alert.call_args.kwargs["event"]["id"])


if __name__ == "__main__":
    unittest.main()
