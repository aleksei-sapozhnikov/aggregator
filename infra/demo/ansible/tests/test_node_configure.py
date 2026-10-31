"""Protect the revision-owned K3s configuration contract without AWS access."""

from __future__ import annotations

import unittest
from pathlib import Path

REPO = Path(__file__).resolve().parents[4]
DEMO = REPO / "infra" / "demo"


class NodeConfigurationContractTests(unittest.TestCase):
    def test_ssm_launcher_uses_shared_lock_and_checked_out_revision(self) -> None:
        launcher = (DEMO / "ssm-node-configure.sh").read_text(encoding="utf-8")
        self.assertEqual(launcher.count("__CONFIGURATION_SHA__"), 1)
        self.assertIn("flock -n 9", launcher)
        self.assertIn("git -C \"$repo_dir\" checkout --force --detach FETCH_HEAD", launcher)
        self.assertIn('git -C "$repo_dir" rev-parse HEAD', launcher)
        self.assertIn('bash "$repo_dir/infra/demo/node-configure.sh" "$revision"', launcher)
        self.assertNotIn("/usr/local/sbin/aggregator-node-configure", launcher)

        readiness = launcher.index("systemctl is-active --quiet k3s")
        recorded = launcher.index("last-configured-revision")
        self.assertLess(readiness, recorded)

    def test_node_configuration_resolves_ansible_relative_to_itself(self) -> None:
        runner = (DEMO / "node-configure.sh").read_text(encoding="utf-8")
        self.assertIn('dirname -- "${BASH_SOURCE[0]}"', runner)
        self.assertIn('cd "$script_dir/ansible"', runner)
        self.assertIn('export AGGREGATOR_REPO_ROOT="$repo_dir"', runner)
        self.assertNotIn("deploy/ansible", runner)

    def test_argocd_helper_path_matches_relocated_checkout(self) -> None:
        path = DEMO / "ansible" / "roles" / "argocd" / "tasks" / "main.yml"
        task = path.read_text(encoding="utf-8")
        self.assertIn("AGGREGATOR_REPO_ROOT", task)
        self.assertIn("ansible.builtin.first_found", task)
        self.assertTrue((REPO / "deploy/argocd/argocd-admin-hash.py").is_file())


if __name__ == "__main__":
    unittest.main()
