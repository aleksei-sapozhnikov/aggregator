"""Regression tests for force-push routing and GitOps release republishing."""

from __future__ import annotations

import os
import subprocess
import tempfile
import unittest
from pathlib import Path

SCRIPT = Path(__file__).resolve().parents[1] / "route-changes.sh"


class ForcePushRoutingTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.repository = Path(self.tmp.name) / "repo"
        self.repository.mkdir()
        self.git("init", "-q")
        self.git("config", "user.name", "Test")
        self.git("config", "user.email", "test@example.invalid")
        self.write("infra/demo/ansible/site.yml", "---\n- hosts: localhost\n")
        self.write("services-core/catalog/README.md", "initial\n")
        self.write("deploy/k8s-live/kustomization.yaml", "resources: []\n")
        self.commit("Initial")
        self.before = self.git("rev-parse", "HEAD").strip()

    def git(self, *args: str) -> str:
        result = subprocess.run(
            ["git", *args], cwd=self.repository,
            capture_output=True, text=True, check=True,
        )
        return result.stdout

    def write(self, path: str, content: str) -> None:
        file = self.repository / path
        file.parent.mkdir(parents=True, exist_ok=True)
        file.write_text(content, encoding="utf-8")

    def commit(self, message: str) -> None:
        self.git("add", "-A")
        self.git("commit", "-qm", message)

    def route(self, *, base: str | None = None) -> str:
        output = self.repository / "github-output"
        output.write_text("", encoding="utf-8")
        env = dict(os.environ)
        env.update({
            "GITHUB_EVENT_NAME": "push",
            "BASE_SHA": base if base is not None else self.before,
            "GITHUB_SHA": self.git("rev-parse", "HEAD").strip(),
            "GITHUB_OUTPUT": str(output),
        })
        result = subprocess.run(
            ["bash", str(SCRIPT)], cwd=self.repository, env=env,
            capture_output=True, text=True, check=False,
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        return output.read_text(encoding="utf-8")

    def test_missing_release_requests_republication_and_plan(self) -> None:
        self.git("rm", "deploy/k8s-live/kustomization.yaml")
        self.commit("Remove generated release")
        result = self.route()
        self.assertIn("bootstrap_missing=true", result)
        self.assertIn("infra_changed=true", result)
        self.assertIn("deploy_changed=false", result)

    def test_app_only_changes_also_check_last_successful_config(self) -> None:
        self.write("services-core/catalog/README.md", "updated\n")
        self.commit("Change application")
        result = self.route()
        self.assertIn("infra_changed=true", result)
        self.assertIn("deploy_changed=true", result)

    def test_generated_manifest_commit_does_not_plan_or_deploy(self) -> None:
        self.write("deploy/k8s-live/kustomization.yaml", "resources: [workloads.yaml]\n")
        self.commit("Regenerate manifests")
        result = self.route()
        self.assertIn("infra_changed=false", result)
        self.assertIn("deploy_changed=false", result)
        self.assertIn("bootstrap_missing=false", result)

    def test_missing_previous_commit_remains_fail_safe_for_routing(self) -> None:
        self.git("rm", "deploy/k8s-live/kustomization.yaml")
        self.commit("Remove generated release")
        result = self.route(base="f" * 40)
        self.assertIn("infra_changed=true", result)
        self.assertIn("deploy_changed=true", result)


if __name__ == "__main__":
    unittest.main()
