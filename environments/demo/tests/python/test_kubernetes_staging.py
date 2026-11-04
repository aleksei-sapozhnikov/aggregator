"""Verify staged Kubernetes monitoring files come from the service owners."""

from __future__ import annotations

import shutil
import sys
import subprocess
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[4]
SCRIPT = ROOT / "environments/demo/src/sh/stage-kubernetes.sh"

CONFIG_SOURCES = {
    "item_health_state.json": "services/grafana/dashboards/item_health_state.json",
    "dashboards.yaml": "services/grafana/provisioning/dashboards/dashboards.yaml",
    "prometheus.yaml": "services/grafana/provisioning/datasources/prometheus.yaml",
    "prometheus.yml": "services/prometheus/prometheus.yml",
}


@unittest.skipIf(sys.platform == "win32", "Requires POSIX shell")
@unittest.skipUnless(
    shutil.which("bash") and shutil.which("git"), "Requires Bash and Git"
)
class KubernetesStagingTests(unittest.TestCase):
    def test_staging_uses_canonical_monitoring_configurations(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            target = Path(directory) / "render"
            result = subprocess.run(
                ["bash", str(SCRIPT), str(target)],
                cwd=ROOT,
                capture_output=True,
                text=True,
                check=False,
            )
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertTrue((target / "kustomization.yaml").is_file())
            self.assertTrue((target / "workloads.yaml").is_file())
            for filename, source in CONFIG_SOURCES.items():
                with self.subTest(filename=filename):
                    self.assertEqual(
                        (target / filename).read_bytes(),
                        (ROOT / source).read_bytes(),
                    )
                    self.assertFalse((ROOT / "deploy/kubernetes" / filename).exists())

    def test_existing_destination_is_not_overwritten(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            target = Path(directory) / "render"
            target.mkdir()
            marker = target / "keep.txt"
            marker.write_text("safe", encoding="utf-8")
            result = subprocess.run(
                ["bash", str(SCRIPT), str(target)],
                cwd=ROOT,
                capture_output=True,
                text=True,
                check=False,
            )
            self.assertNotEqual(result.returncode, 0)
            self.assertEqual(marker.read_text(encoding="utf-8"), "safe")


if __name__ == "__main__":
    unittest.main()
