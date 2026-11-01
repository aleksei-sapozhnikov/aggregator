"""Regression tests for force-push and GitOps release routing."""

from __future__ import annotations

import os
import subprocess
import tempfile
import unittest
from pathlib import Path

SCRIPTS = Path(__file__).resolve().parents[1]


class ForcePushRoutingTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.repository = self.root / "repo"
        self.repository.mkdir()
        self.runtime = self.root / "runner"
        self.runtime.mkdir()
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
            ["git", *args],
            cwd=self.repository,
            capture_output=True,
            text=True,
            check=True,
        )
        return result.stdout

    def write(self, path: str, value: str) -> None:
        dest = self.repository / path
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_text(value, encoding="utf-8")

    def commit(self, message: str) -> None:
        self.git("add", "-A")
        self.git("commit", "-qm", message)

    def script(self, name: str, **overrides: str) -> tuple[str, str]:
        output = self.runtime / "github-output"
        output.write_text("", encoding="utf-8")
        env = dict(os.environ)
        env.update(
            {
                "GITHUB_EVENT_NAME": "push",
                "BASE_SHA": self.before,
                "GITHUB_SHA": self.git("rev-parse", "HEAD").strip(),
                "GITHUB_OUTPUT": str(output),
                "RUNNER_TEMP": str(self.runtime),
                "MANUAL_REAPPLY": "false",
                "BOOTSTRAP_MISSING": "true",
                "K3S_ENABLED": "true",
            }
        )
        env.update(overrides)
        result = subprocess.run(
            ["bash", str(SCRIPTS / name)],
            cwd=self.repository,
            env=env,
            capture_output=True,
            text=True,
            check=False,
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        return output.read_text(encoding="utf-8"), result.stderr

    def test_missing_release_requests_republication_without_ansible(self) -> None:
        self.git("rm", "deploy/k8s-live/kustomization.yaml")
        self.commit("Remove generated release")
        routing, _ = self.script("route-changes.sh")
        self.assertIn("bootstrap_missing=true", routing)
        self.assertIn("infra_changed=true", routing)
        self.assertIn("deploy_changed=false", routing)
        ansible, _ = self.script("detect-ansible-changes.sh")
        self.assertIn("ansible_changed=false", ansible)

    def test_node_config_change_triggers_ansible_even_without_release(self) -> None:
        self.git("rm", "deploy/k8s-live/kustomization.yaml")
        self.write("infra/demo/ansible/site.yml", "---\n- hosts: localhost\n  gather_facts: false\n")
        self.commit("Change node configuration")
        ansible, _ = self.script("detect-ansible-changes.sh")
        self.assertIn("ansible_changed=true", ansible)
        self.assertTrue((self.runtime / "ansible-diff.patch").stat().st_size)

    def test_force_push_with_unavailable_base_does_not_auto_reconfigure(self) -> None:
        self.git("rm", "deploy/k8s-live/kustomization.yaml")
        self.commit("Remove generated release")
        missing_sha = "f" * 40
        routing, _ = self.script("route-changes.sh", BASE_SHA=missing_sha)
        self.assertIn("infra_changed=true", routing)
        self.assertIn("deploy_changed=true", routing)
        ansible, warning = self.script("detect-ansible-changes.sh", BASE_SHA=missing_sha)
        self.assertIn("ansible_changed=false", ansible)
        self.assertIn("::warning::", warning)

    def test_explicit_manual_reapply_still_triggers_ansible(self) -> None:
        ansible, _ = self.script(
            "detect-ansible-changes.sh",
            GITHUB_EVENT_NAME="workflow_dispatch",
            MANUAL_REAPPLY="true",
        )
        self.assertIn("ansible_changed=true", ansible)


if __name__ == "__main__":
    unittest.main()
