"""Prevent regressions in scoped Publisher Lambda Layer management rights."""

import json
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
ADMIN = ROOT / "infra" / "administration" / "policies"
LAYER_ARN = (
    "arn:aws:lambda:eu-central-1:905418096305:"
    "layer:aggregator-publisher-git"
)


class PublisherGitLayerIamTests(unittest.TestCase):
    def test_management_policy_scopes_layer_permissions(self):
        document = json.loads(
            (ADMIN / "AggregatorPublisherManagement.json").read_text(
                encoding="utf-8"
            )
        )
        by_sid = {row["Sid"]: row for row in document["Statement"]}
        publish = by_sid["PublishPublisherGitLayer"]
        self.assertEqual("Allow", publish["Effect"])
        self.assertEqual("lambda:PublishLayerVersion", publish["Action"])
        self.assertEqual(LAYER_ARN, publish["Resource"])

        versions = by_sid["ManagePublisherGitLayerVersions"]
        self.assertEqual("Allow", versions["Effect"])
        self.assertEqual(
            {"lambda:GetLayerVersion", "lambda:DeleteLayerVersion"},
            set(versions["Action"]),
        )
        self.assertEqual(f"{LAYER_ARN}:*", versions["Resource"])

    def test_runtime_role_boundary_has_no_layer_management_rights(self):
        document = json.loads(
            (ADMIN / "AggregatorPublisherRoleBoundary.json").read_text(
                encoding="utf-8"
            )
        )
        for statement in document["Statement"]:
            actions = statement["Action"]
            if isinstance(actions, str):
                actions = [actions]
            self.assertNotIn("lambda:PublishLayerVersion", actions)
            self.assertNotIn("lambda:DeleteLayerVersion", actions)


if __name__ == "__main__":
    unittest.main()
