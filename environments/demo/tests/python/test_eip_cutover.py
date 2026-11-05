"""Protect the single K3s deployment and its existing Elastic IP."""

from __future__ import annotations

import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[4]
INFRA = ROOT / "environments/demo/infra"


class K3sSingleRuntimeTests(unittest.TestCase):
    def test_existing_public_address_is_protected(self) -> None:
        source = (INFRA / "main.tf").read_text(encoding="utf-8")
        self.assertNotIn("moved {", source)
        self.assertIn('resource "aws_eip" "public"', source)
        self.assertIn('resource "aws_eip_association" "public"', source)
        self.assertIn('module "aggregator_demo_k3s"', source)
        self.assertIn("prevent_destroy = true", source)
        self.assertIn(
            "instance_id         = module.aggregator_demo_k3s.instance_id",
            source,
        )
        self.assertNotIn('source = "./modules/ec2_legacy"', source)

    def test_no_k3s_or_eip_routing_flags(self) -> None:
        infra = (INFRA / "variables.tf").read_text(encoding="utf-8")
        flow = (ROOT / ".github/workflows/demo-infra.yml").read_text(encoding="utf-8")
        for flag in (
            "eip_target_k3s",
            "EIP_TARGET_K3S",
            "enable_k3s_node",
            "ENABLE_K3S_NODE",
            "ENABLE_BEDROCK",
        ):
            self.assertNotIn(flag, infra + flow)

    def test_protected_resources_cannot_be_destroyed_by_plan(self) -> None:
        script = (ROOT / "environments/demo/src/sh/plan.sh").read_text(encoding="utf-8")
        self.assertIn("module.aggregator_demo_k3s", script)
        self.assertIn("aws_eip.public", script)
        self.assertIn("aws_eip_association.public", script)
        self.assertIn(
            "Protected K3s/EIP resource would be created or destroyed",
            script,
        )

    def test_legacy_cleanup_permissions_are_retired(self) -> None:
        policies = ROOT / "environments/shared/infra/administration/policies"
        iam = (policies / "AggregatorDemoIAMManagement.json").read_text(encoding="utf-8")
        ssm = (policies / "AggregatorDemoK3sRunCommand.json").read_text(encoding="utf-8")
        self.assertNotIn("AggregatorDemoEC2Role", iam)
        self.assertNotIn("RetireLegacyDemoDeployDocument", ssm)


if __name__/ == "__main__":
    unittest.main()
