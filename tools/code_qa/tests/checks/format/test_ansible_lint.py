"""Verify Ansible QA commands, isolated execution, and hook scope."""

from __future__ import annotations

import json
import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from code_qa.src.checks.format import ansible_lint


class AnsibleLintTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.workspace = Path(self.temp.name)
        self.directory = self.workspace / "infra/demo/ansible"

    def test_checks_syntax_then_basic_lint_offline(self) -> None:
        with (
            patch.object(ansible_lint.sys, "platform", "linux"),
            patch.object(
                ansible_lint,
                "ensure_ansible_python",
                return_value="/qa/venv/bin/python",
            ),
            patch.object(
                ansible_lint.subprocess,
                "run",
                return_value=subprocess.CompletedProcess([], 0),
            ) as execute,
        ):
            self.assertEqual(ansible_lint.run(self.directory, self.workspace), 0)
        self.assertEqual(execute.call_count, 2)
        syntax, lint = (call.args[0] for call in execute.call_args_list)
        self.assertEqual(
            syntax,
            [
                str(Path("/qa/venv/bin/python").parent / "ansible-playbook"),
                "-i",
                "localhost,",
                "--syntax-check",
                "site.yml",
            ],
        )
        self.assertEqual(
            lint,
            [
                str(Path("/qa/venv/bin/python").parent / "ansible-lint"),
                "--offline",
                "--profile=basic",
                "--nocolor",
                "site.yml",
            ],
        )
        for call in execute.call_args_list:
            self.assertEqual(call.kwargs["cwd"], self.directory)
            self.assertEqual(
                call.kwargs["env"]["ANSIBLE_ROLES_PATH"], str(self.directory / "roles")
            )

    def test_hook_scope_skips_docs_but_includes_deleted_tasks(self) -> None:
        manifest = self.workspace / "changes.json"
        manifest.write_text(
            json.dumps(["infra/demo/ansible/README.md"]), encoding="utf-8"
        )
        with patch.object(ansible_lint, "ensure_ansible_python") as installer:
            self.assertEqual(
                ansible_lint.run(self.directory, self.workspace, manifest), 0
            )
        installer.assert_not_called()

        manifest.write_text(
            json.dumps(["infra/demo/ansible/roles/common/tasks/deleted.yml"]),
            encoding="utf-8",
        )
        with (
            patch.object(ansible_lint.sys, "platform", "linux"),
            patch.object(
                ansible_lint, "ensure_ansible_python", return_value=None
            ) as installer,
        ):
            self.assertEqual(
                ansible_lint.run(self.directory, self.workspace, manifest), 1
            )
        installer.assert_called_once_with(self.workspace)

    def test_failed_syntax_prevents_lint(self) -> None:
        with (
            patch.object(ansible_lint.sys, "platform", "linux"),
            patch.object(
                ansible_lint,
                "ensure_ansible_python",
                return_value="/qa/venv/bin/python",
            ),
            patch.object(
                ansible_lint.subprocess,
                "run",
                return_value=subprocess.CompletedProcess([], 2),
            ) as execute,
        ):
            self.assertEqual(ansible_lint.run(self.directory, self.workspace), 2)
        execute.assert_called_once()

    def test_windows_requires_linux_environment(self) -> None:
        with (
            patch.object(ansible_lint.sys, "platform", "win32"),
            patch.object(ansible_lint, "ensure_ansible_python") as installer,
        ):
            self.assertEqual(ansible_lint.run(self.directory, self.workspace), 1)
        installer.assert_not_called()


if __name__ == "__main__":
    unittest.main()
