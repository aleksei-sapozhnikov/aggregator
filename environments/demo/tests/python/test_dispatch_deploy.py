"""Ensure a published but stale GitOps release is republished."""

from __future__ import annotations

import os
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

SCRIPT = Path(__file__).resolve().parents[2] / "src/sh/dispatch-deploy.sh"


@unittest.skipIf(sys.platform == "win32", "Requires a POSIX shell")
@unittest.skipUnless(
    all(shutil.which(cmd) for cmd in ("bash", "git", "tar", "diff", "python3")),
    "Requires Bash, Git, tar, diff, and Python 3",
)
class DispatchDeployTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.repo = self.root / "repo"
        self.repo.mkdir()
        self.commands = self.root / "dispatched"
        self.summary = self.root / "summary"
        self.bin_dir = self.root / "bin"
        self.bin_dir.mkdir()

        gh = self.bin_dir / "gh"
        gh.write_text(
            '#!/usr/bin/env bash\nprintf "%s\\n" "$*" >> "$DISPATCH_LOG"\n',
            encoding="utf-8",
        )
        gh.chmod(0o755)

        self.git("init", "-q", "-b", "deploy/demo")
        self.git("config", "user.name", "Test")
        self.git("config", "user.email", "test@example.invalid")

        self.write(
            "deploy/kubernetes/kustomization.yaml",
            "apiVersion: kustomize.config.k8s.io/v1beta1\nkind: Kustomization\n",
        )
        self.write("deploy/kubernetes/workloads.yaml", "kind: Deployment\n")
        self.write(
            "environments/demo/src/sh/stage-kubernetes.sh",
            "#!/usr/bin/env bash\nset -euo pipefail\ncp -a deploy/kubernetes \"$1\"\n",
        )
        self.write(
            "environments/demo/src/python/image_tags.py",
            "# Fixture images have stable tags; no changes needed.\n",
        )
        shutil.copytree(
            self.repo / "deploy/kubernetes", self.repo / "deploy/k8s-live"
        )
        self.git("add", "-A")
        self.git("commit", "-qm", "Initial matching GitOps release")
        self.git("branch", "deploy/demo-gitops")
        self.git("remote", "add", "origin", str(self.repo))

    def write(self, path: str, content: str) -> None:
        target = self.repo / path
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(content, encoding="utf-8")

    def git(self, *args: str) -> str:
        result = subprocess.run(
            ["git", *args],
            cwd=self.repo,
            capture_output=True,
            text=True,
            check=True,
        )
        return result.stdout.strip()

    def dispatch(self, *, app_changed: bool = False, destroyed: bool = False) -> str:
        env = dict(os.environ)
        env.update(
            {
                "PATH": str(self.bin_dir) + os.pathsep + os.environ["PATH"],
                "GITHUB_SHA": self.git("rev-parse", "HEAD"),
                "GITHUB_REPOSITORY": "example/aggregator",
                "GITHUB_STEP_SUMMARY": str(self.summary),
                "DISPATCH_LOG": str(self.commands),
                "APP_CHANGED": str(app_changed).lower(),
                "INFRA_CHANGED": "false",
                "K3S_ENABLED": "true",
                "K3S_DESTROYED": str(destroyed).lower(),
                "SOURCE_BRANCH": "deploy/demo",
                "GITOPS_BRANCH": "deploy/demo-gitops",
            }
        )
        result = subprocess.run(
            ["bash", str(SCRIPT)],
            cwd=self.repo,
            env=env,
            capture_output=True,
            text=True,
            check=False,
        )
        self.assertEqual(result.returncode, 0, result.stderr + result.stdout)
        return self.commands.read_text(encoding="utf-8") if self.commands.exists() else ""

    def test_matching_release_skips_dispatch(self) -> None:
        self.assertEqual(self.dispatch(), "")
        self.assertIn("matches the current desired snapshot", self.summary.read_text())

    def test_stale_manifest_dispatches_even_without_app_changes(self) -> None:
        self.write("deploy/kubernetes/workloads.yaml", "kind: Deployment\nupdated: true\n")
        self.git("add", "-A")
        self.git("commit", "-qm", "Modify source without publishing GitOps")
        self.assertIn("actions/workflows/demo-deploy.yml/dispatches", self.dispatch())
        self.assertIn("GitOps snapshot outdated: true", self.summary.read_text())

    def test_explicit_app_change_dispatches(self) -> None:
        self.assertIn("actions/workflows/demo-deploy.yml/dispatches", self.dispatch(app_changed=True))

    def test_teardown_never_dispatches(self) -> None:
        self.assertEqual(self.dispatch(destroyed=True), "")


if __name__ == "__main__":
    unittest.main()
