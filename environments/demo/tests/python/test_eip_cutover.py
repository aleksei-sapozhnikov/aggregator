"""Keep the Elastic IP cutover opt-in and enforce the GitHub pipeline flags."""

from __future__ import annotations

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


if __name__ == "__main__":
    unittest.main()
