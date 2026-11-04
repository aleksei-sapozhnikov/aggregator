"""Check that notification reports omit private endpoint metadata."""

from __future__ import annotations

import json
import sys
import unittest
from pathlib import Path

SOURCE_TOOLS = Path(__file__).resolve().parent.parent / "src"
sys.path.insert(0, str(SOURCE_TOOLS))

from inspect_publication_notifications import policy_summary


class NotificationSummaryTests(unittest.TestCase):
    def test_policy_summary_omits_unrelated_endpoint_fields(self):
        endpoint = "private@example.com"
        document = {
            "Endpoint": endpoint,
            "Statement": {
                "Sid": "PublishFailures",
                "Effect": "Allow",
                "Action": "sns:Publish",
                "Resource": "arn:aws:sns:eu-central-1:905418096305:topic",
            },
        }

        summary = policy_summary(document)

        self.assertEqual(summary[0]["actions"], ["sns:Publish"])
        self.assertNotIn(endpoint, json.dumps(summary))


if __name__ == "__main__":
    unittest.main()
