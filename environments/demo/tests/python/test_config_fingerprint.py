"""Tests for content-based Ansible reconciliation and SSM success records."""

from __future__ import annotations

import importlib.util
import os
import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest import mock

MODULE_FILE = Path(__file__).resolve().parents[2] / "src" / "python" / "config_fingerprint.py"
SPEC = importlib.util.spec_from_file_location("config_fingerprint", MODULE_FILE)
assert SPEC is not None and SPEC.loader is not None
module = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(module)

NODE = "i-12345678"


class FingerprintTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.git("init", "-q")
        self.git("config", "user.name", "Test")
        self.git("config", "user.email", "test@example.invalid")
        self.write("environments/demo/ansible/site.yml", "---\n- hosts: localhost\n")
        self.write("environments/demo/ansible/group_vars/all.yml", "k3s_version: v1\n")
        self.write(
            "environments/demo/ansible/roles/k3s/tasks/main.yml", "---\n- name: Check node\n"
        )
        self.write("environments/demo/src/sh/node-configure.sh", "#!/bin/bash\n")
        self.write("environments/demo/src/sh/ssm-node-configure.sh", "#!/bin/sh\n")
        self.write("tools/argocd/src/argocd_admin_hash.py", "pass\n")
        self.write("services/catalog/README.md", "initial\n")
        self.write("environments/demo/ansible/README.md", "documentation\n")
        self.commit("Initial configuration")
        self.root_patch = mock.patch.object(module, "ROOT", self.root)
        self.root_patch.start()
        self.addCleanup(self.root_patch.stop)
        self.output_file = self.root / "github-output"
        self.output_file.write_text("", encoding="utf-8")
        self.runner_dir = self.root / "runner"
        self.runner_dir.mkdir()

    def git(self, *args: str) -> str:
        return subprocess.run(
            ["git", *args],
            cwd=self.root,
            capture_output=True,
            text=True,
            check=True,
        ).stdout

    def write(self, path: str, value: str) -> None:
        file = self.root / path
        file.parent.mkdir(parents=True, exist_ok=True)
        file.write_text(value, encoding="utf-8")

    def commit(self, message: str) -> None:
        self.git("add", "-A")
        self.git("commit", "-qm", message)

    def check(
        self,
        previous: str | None,
        *,
        creating: bool = False,
        manual: bool = False,
        existing: str | None = NODE,
    ) -> str:
        self.output_file.write_text("", encoding="utf-8")
        environment = {
            "GITHUB_OUTPUT": str(self.output_file),
            "RUNNER_TEMP": str(self.runner_dir),
            "K3S_ENABLED": "true",
            "K3S_CREATED": str(creating).lower(),
            "MANUAL_REAPPLY": str(manual).lower(),
        }
        with (
            mock.patch.dict(os.environ, environment),
            mock.patch.object(module, "state_instance_id", return_value=existing),
            mock.patch.object(module, "previous_value", return_value=previous),
        ):
            module.check()
        return self.output_file.read_text(encoding="utf-8")

    def test_application_commits_do_not_change_configuration_fingerprint(self) -> None:
        before = module.fingerprint()
        self.write("services/catalog/README.md", "changed source\n")
        self.write("environments/demo/ansible/README.md", "changed documentation\n")
        self.commit("Application and documentation changes")
        self.assertEqual(before, module.fingerprint())
        self.assertIn("ansible_changed=false", self.check(f"{NODE}:{before}"))

    def test_changed_ansible_content_triggers_reconciliation(self) -> None:
        before = module.fingerprint()
        self.write("environments/demo/ansible/group_vars/all.yml", "k3s_version: v2\n")
        self.commit("Change node configuration")
        after = module.fingerprint()
        self.assertNotEqual(before, after)
        self.assertIn("ansible_changed=true", self.check(f"{NODE}:{before}"))

    def test_unrecorded_or_failed_application_is_retried(self) -> None:
        digest = module.fingerprint()
        self.assertIn("ansible_changed=true", self.check(None))
        self.assertIn("ansible_changed=true", self.check(f"{NODE}:{'0' * 64}"))
        self.assertIn("ansible_changed=false", self.check(f"{NODE}:{digest}"))

    def test_new_instance_requires_configuration_even_when_digest_matches(self) -> None:
        digest = module.fingerprint()
        self.assertIn(
            "ansible_changed=true",
            self.check(f"{NODE}:{digest}", creating=True),
        )
        self.assertIn(
            "ansible_changed=true",
            self.check(f"{NODE}:{digest}", existing="i-87654321"),
        )

    def test_manual_reapply_triggers_configuration(self) -> None:
        digest = module.fingerprint()
        self.assertIn(
            "ansible_changed=true",
            self.check(f"{NODE}:{digest}", manual=True),
        )

    def test_disabled_k3s_does_not_touch_ssm(self) -> None:
        self.output_file.write_text("", encoding="utf-8")
        with (
            mock.patch.dict(
                os.environ,
                {"GITHUB_OUTPUT": str(self.output_file), "K3S_ENABLED": "false"},
            ),
            mock.patch.object(module, "previous_value") as read,
        ):
            module.check()
            read.assert_not_called()
        self.assertIn("ansible_changed=false", self.output_file.read_text())

    def test_ssm_access_failure_does_not_look_like_missing_parameter(self) -> None:
        with (
            mock.patch.object(
                module,
                "aws",
                return_value=subprocess.CompletedProcess(
                    args=[],
                    returncode=255,
                    stdout="",
                    stderr="AccessDeniedException",
                ),
            ),
            self.assertRaises(RuntimeError),
        ):
            module.previous_value()

    def test_ssm_rejects_non_string_parameter_value(self) -> None:
        with (
            mock.patch.object(
                module,
                "aws",
                return_value=subprocess.CompletedProcess(
                    args=[],
                    returncode=0,
                    stdout='{"Parameter": {"Value": 123}}',
                    stderr="",
                ),
            ),
            self.assertRaisesRegex(TypeError, "Unexpected SSM parameter value"),
        ):
            module.previous_value()

    def test_record_requires_confirmed_instance_and_matching_fingerprint(self) -> None:
        digest = module.fingerprint()
        with (
            mock.patch.dict(
                os.environ,
                {"SSM_INSTANCE_ID": NODE, "EXPECTED_FINGERPRINT": digest},
            ),
            mock.patch.object(module, "state_instance_id", return_value=NODE),
            mock.patch.object(
                module,
                "aws",
                return_value=subprocess.CompletedProcess(
                    args=[],
                    returncode=0,
                    stdout="{}",
                    stderr="",
                ),
            ) as write,
        ):
            module.record()
            args = write.call_args.args
            self.assertIn("put-parameter", args)
            self.assertIn(f"{NODE}:{digest}", args)
        with (
            mock.patch.dict(
                os.environ,
                {"SSM_INSTANCE_ID": NODE, "EXPECTED_FINGERPRINT": digest},
            ),
            mock.patch.object(module, "state_instance_id", return_value="i-87654321"),
            mock.patch.object(module, "aws") as write,
        ):
            with self.assertRaises(RuntimeError):
                module.record()
            write.assert_not_called()


if __name__ == "__main__":
    unittest.main()
