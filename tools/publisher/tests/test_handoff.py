"""Prove the publisher cannot start until the legacy queue finishes."""

import json
import sys
import unittest
from pathlib import Path
from unittest.mock import Mock, patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "runtime" / "src"))
from publisher_runtime.handler import lambda_handler, legacy_finished


class LegacyHandoffTests(unittest.TestCase):
    def test_legacy_completion_required(self):
        ddb = Mock()
        ddb.Table.return_value.get_item.return_value = {
            "Item": {
                "data_revision": "0" * 64,
                "progress": json.dumps({"completed": ["aggregator-071-merge"]}),
            }
        }
        fake_snapshot = {
            "schedule": {
                "events": [
                    {"id": "aggregator-070-merge"},
                    {"id": "aggregator-071-merge"},
                ]
            }
        }
        with patch(
            "lambda_publisher.publication.publication.load_snapshot",
            return_value=fake_snapshot,
        ):
            self.assertFalse(
                legacy_finished(
                    ddb,
                    Mock(),
                    table="legacy",
                    bucket="legacy",
                    last_id="aggregator-071-merge",
                )
            )
            ddb.Table.return_value.get_item.return_value["Item"]["progress"] = (
                json.dumps(
                    {"completed": ["aggregator-070-merge", "aggregator-071-merge"]}
                )
            )
            self.assertTrue(
                legacy_finished(
                    ddb,
                    Mock(),
                    table="legacy",
                    bucket="legacy",
                    last_id="aggregator-071-merge",
                )
            )

    def test_unexpected_event_rejected(self):
        with self.assertRaisesRegex(RuntimeError, "only accepts watchdog"):
            lambda_handler({"event_id": "publisher-001-open"}, None)


if __name__ == "__main__":
    unittest.main()
