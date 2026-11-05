"""Check K3s rollout policies and readiness contracts."""

from __future__ import annotations

import re
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[4]
MANIFEST = ROOT / "deploy/kubernetes/workloads.yaml"
AGGREGATOR_CONFIG = ROOT / "services/aggregator/src/main/resources/application.yaml"

ROLLING_SERVICES = {
    "catalog": "/health",
    "aggregator": "/actuator/health/readiness",
    "aggregator-ui": "/config.json",
    "ai-agent": "/health",
}
RECREATE_SERVICES = {
    "chaos-maker",
    "dummy-java",
    "dummy-python",
    "dummy-javascript",
    "prometheus",
    "grafana",
}


def deployment_sections() -> dict[str, str]:
    content = MANIFEST.read_text(encoding="utf-8")
    sections: dict[str, str] = {}
    for section in re.split(r"^---\s*$", content, flags=re.MULTILINE):
        if not re.search(r"^kind: Deployment$", section, re.MULTILINE):
            continue
        match = re.search(r"^metadata:\n  name: ([a-z0-9-]+)$", section, re.MULTILINE)
        if match is None:
            raise AssertionError("Deployment is missing its metadata.name")
        sections[match.group(1)] = section
    return sections


class KubernetesRolloutTests(unittest.TestCase):
    def test_stateless_services_replace_only_after_readiness(self) -> None:
        sections = deployment_sections()
        for name, path in ROLLING_SERVICES.items():
            with self.subTest(name=name):
                self.assertIn(name, sections)
                section = sections[name]
                self.assertIn("type: RollingUpdate", section)
                self.assertIn("maxSurge: 1", section)
                self.assertIn("maxUnavailable: 0", section)
                self.assertIn("minReadySeconds: 5", section)
                self.assertIn("readinessProbe:", section)
                self.assertIn(f"path: {path}", section)

    def test_stateful_or_demo_singletons_remain_recreate(self) -> None:
        sections = deployment_sections()
        for name in RECREATE_SERVICES:
            with self.subTest(name=name):
                self.assertIn(name, sections)
                self.assertIn("type: Recreate", sections[name])
                self.assertNotIn("type: RollingUpdate", sections[name])

    def test_all_deployments_are_explicitly_classified(self) -> None:
        self.assertEqual(
            set(deployment_sections()), set(ROLLING_SERVICES) | RECREATE_SERVICES
        )

    def test_aggregator_exposes_readiness_without_losing_metrics(self) -> None:
        config = AGGREGATOR_CONFIG.read_text(encoding="utf-8")
        self.assertIn("probes:\n        enabled: true", config)
        self.assertIn("- health", config)
        self.assertIn("- prometheus", config)


if __name__ == "__main__":
    unittest.main()
