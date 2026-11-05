"""Keep the Elastic IP cutover opt-in and enforce the GitHub pipeline flags."""

from __future__ import annotations

import json
import os
import subprocess
import tempfile
import unittest
from pathlib import Path

SCRIPT = Path(__file__).resolve().parents[2] / "src" / "sh" / "check-flags.sh"


@unittest.skipIf(os.name == "nt", "Requires Bash")
class EipCutoverFlagTests(unittest.TestCase):
    def run_flags(
        self, *, k3s: str, bedrock: str = "true", eip: str = "false"
    ) -> tuple[int, str, str]:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            env_file = root / "env"
            output_file = root / "output"
            env = dict(os.environ)
            env.update(
                {
                    "ENABLE_K3S_NODE": k3s,
                    "ENABLE_BEDROCK": bedrock,
                    "EIP_TARGET_K3S": eip,
                    "GITHUB_ENV": str(env_file),
                    "GITHUB_OUTPUT": str(output_file),
                }
            )
            result = subprocess.run(
                ["bash", str(SCRIPT)],
                env=env,
                capture_output=True,
                text=True,
                check=False,
            )
            return (
                result.returncode,
                env_file.read_text(encoding="utf-8") if env_file.exists() else "",
                result.stdout,
            )

    def test_default_keeps_original_elastic_ip_target(self) -> None:
        status, settings, _ = self.run_flags(k3s="true", eip="false")
        self.assertEqual(status, 0)
        self.assertIn("TF_VAR_eip_target_k3s=false", settings)

    def test_k3s_cutover_requires_explicit_true(self) -> None:
        status, settings, _ = self.run_flags(k3s="true", eip="true")
        self.assertEqual(status, 0)
        self.assertIn("TF_VAR_eip_target_k3s=true", settings)

    def test_k3s_disabled_blocks_cutover(self) -> None:
        status, _, output = self.run_flags(k3s="false", eip="true")
        self.assertNotEqual(status, 0)
        self.assertIn("ENABLE_K3S_NODE=false", output)

    def test_rejects_unknown_flag(self) -> None:
        status, _, output = self.run_flags(k3s="true", eip="maybe")
        self.assertNotEqual(status, 0)
        self.assertIn("EIP_TARGET_K3S must be true or false", output)


class EipCutoverIAMPolicyTests(unittest.TestCase):
    """Require source and target ENI permissions without account-wide grants."""

    def test_eni_permissions_are_limited_to_demo_subnet(self) -> None:
        policy_path = (
            Path(__file__).resolve().parents[4]
            / "environments/shared/infra/administration/policies"
            / "AggregatorDemoEC2Management.json"
        )
        statements = json.loads(policy_path.read_text(encoding="utf-8"))[
            "Statement"
        ]
        by_sid = {statement.get("Sid"): statement for statement in statements}

        eip = by_sid["ManageEIP"]
        self.assertEqual(
            eip["Resource"],
            "arn:aws:ec2:eu-central-1:905418096305:elastic-ip/*",
        )
        self.assertEqual(
            eip["Condition"]["StringEquals"]["aws:ResourceTag/Project"],
            "aggregator",
        )

        eni = by_sid["EIPNetworkInterfacesInDemoSubnet"]
        self.assertEqual(eni["Effect"], "Allow")
        self.assertEqual(
            set(eni["Action"]),
            {"ec2:DisassociateAddress", "ec2:AssociateAddress"},
        )
        self.assertEqual(
            eni["Resource"],
            "arn:aws:ec2:eu-central-1:905418096305:network-interface/*",
        )
        self.assertEqual(
            eni["Condition"],
            {
                "ArnEquals": {
                    "ec2:Subnet": (
                        "arn:aws:ec2:eu-central-1:905418096305:"
                        "subnet/subnet-0911c2ce97b9adc80"
                    )
                }
            },
        )


if __name__ == "__main__":
    unittest.main()
