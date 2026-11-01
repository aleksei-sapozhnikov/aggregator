"""Regression tests for source/GitOps separation and force-push routing."""

from __future__ import annotations

import os
import subprocess
import tempfile
import unittest
from pathlib import Path

SCRIPT = Path(__file__).resolve().parents[2] / "src" / "sh" / route-changes.sh"


class ForcePushRoutingTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.repository = Path(self.tmp.name) / "repo"
        self.repository.mkdir()
        self.git("init", "-q")
        self.git("config", "user.name", "Test")
        self.git("config", "user.email", "test@example.invalid")
        self.write("environments/demo/ansible/site.yml", "---\n- hosts: localhost\n")
        self.write("services/catalog/README.md", "initial\n")
        self.write("deploy/k8s-live/kustomization.yaml", "resources: []\n")
        self.commit("Initial")
        self.source_branch = self.git("branch", "--show-current").strip()
        self.git("branch", "deploy/demo-gitops")
        self.git("remote", "add", "origin", str(self.repository))
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
        env.update(
            {
                "GITHUB_EVENT_NAME": "push",
                "BASE_SHA": base if base is not None else self.before,
                "GITHUB_SHA": self.git("rev-parse", "HEAD").strip(),
                "GITHUB_OUTPUT": str(output),
                "GITOPS_BRANCH": "deploy/demo-gitops",
            }
        )
        result = subprocess.run(
            ["bash", str(SCRIPT)],
            cwd=self.repository,
            env=env,
            capture_output=True,
            text=True,
            check=False,
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        return output.read_text(encoding="utf-8")

    def test_source_force_push_can_remove_generated_manifests(self) -> None:
        self.git("rm", "deploy/k8s-live/kustomization.yaml")
        self.commit("Remove generated source manifests")
        result = self.route()
        self.assertIn("bootstrap_missing=false", result)
        self.assertIn("infra_changed=false", result)
        self.assertIn("deploy_changed=false", result)

    def test_argocd_utility_change_triggers_infrastructure_not_image_deploy(self) -> None:
        self.write("tools/argocd/src/argocd_admin_hash.py", "print('changed')\n")
        self.commit("Change Argo CD admin hash helper")
        result = self.route()
        self.assertIn("infra_changed=true", result)
        self.assertIn("deploy_changed=false", result)

    def test_demo_infrastructure_changes_do_not_trigger_image_builds(self) -> None:
        self.write("environments/demo/infra/main.tf", "resource \"null_resource\" \"test\" {}\n")
        self.commit("Change demo infrastructure")
        result = self.route()
        self.assertIn("infra_changed=true", result)
        self.assertIn("deploy_changed=false", result)

    def test_app_only_changes_still_check_last_successful_config(self) -> None:
        self.write("services/catalog/README.md", "updated\n")
        self.commit("Change application")
        result = self.route()
        self.assertIn("infra_changed=true", result)
        self.assertIn("deploy_changed=true", result)

    def test_missing_gitops_release_requests_republication_and_plan(self) -> None:
        self.git("switch", "deploy/demo-gitops")
        self.git("rm", "deploy/k8s-live/kustomization.yaml")
        self.commit("Remove published GitOps manifest")
        self.git("switch", self.source_branch)
        result = self.route()
        self.assertIn("bootstrap_missing=true", result)
        self.assertIn("infra_changed=true", result)
        self.assertIn("deploy_changed=false", result)

    def test_manifest_only_source_commit_does_not_plan(self) -> None:
        self.write(
            "deploy/k8s-live/kustomization.yaml", "resources: [workloads.yaml]\n"
        )
        self.commit("Change generated source manifests")
        result = self.route()
        self.assertIn("infra_changed=false", result)
        self.assertIn("deploy_changed=false", result)
        self.assertIn("bootstrap_missing=false", result)

    def test_unavailable_previous_commit_remains_fail_safe(self) -> None:
        result = self.route(base="f" * 40)
        self.assertIn("infra_changed=true", result)
        self.assertIn("deploy_changed=true", result)


if __name__ == "__main__":
    unittest.main()
