"""Verify Ansible QA uses isolated and pinned dependencies."""

from __future__ import annotations

import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from code_qa.src.tools import ansible


class AnsibleToolTests(unittest.TestCase):
    def test_installs_once_and_reuses_matching_requirements(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            requirements_dir = root / "tools"
            requirements_dir.mkdir()
            requirements = requirements_dir / "requirements-ansible.txt"
            requirements.write_text("ansible-lint==26.10.1\n", encoding="utf-8")
            python = root / ".local/qa-runtime/ansible/venv/bin/python"
            with (
                patch.object(ansible.sys, "platform", "linux"),
                patch.object(ansible, "project_dir", return_value=requirements_dir),
                patch.object(ansible, "python_has_module", return_value=True),
                patch.object(
                    ansible.subprocess, "run",
                    return_value=subprocess.CompletedProcess([], 0),
                ) as execute,
            ):
                self.assertEqual(ansible.ensure_ansible_python(root), str(python))
                self.assertEqual(ansible.ensure_ansible_python(root), str(python))
            self.assertEqual(execute.call_count, 2)
            self.assertEqual(execute.call_args_list[0].args[0][:3], [
                ansible.sys.executable, "-m", "venv"
            ])
            self.assertEqual(execute.call_args_list[1].args[0][:4], [
                str(python), "-m", "pip", "install"
            ])

    def test_failed_install_is_not_cached(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            (root / "requirements-ansible.txt").write_text(
                "ansible-lint==26.10.1\n", encoding="utf-8"
            )
            with (
                patch.object(ansible.sys, "platform", "linux"),
                patch.object(ansible, "project_dir", return_value=root),
                patch.object(ansible, "python_has_module", return_value=True),
                patch.object(
                    ansible.subprocess, "run",
                    side_effect=[
                        subprocess.CompletedProcess([], 0),
                        subprocess.CompletedProcess([], 1, "", "offline"),
                    ],
                ),
            ):
                self.assertIsNone(ansible.ensure_ansible_python(root))
            self.assertFalse(list(root.rglob("requirements.sha256")))


if __name__ == "__main__":
    unittest.main()
