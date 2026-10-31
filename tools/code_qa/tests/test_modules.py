"""Verify module paths and command parameters stay in the orchestrator."""

from __future__ import annotations

import json
import tempfile
import unittest
from contextlib import redirect_stdout
from dataclasses import replace
from io import StringIO
from pathlib import Path
from unittest.mock import patch

from code_qa.src.core import cli, inputs, modules
from code_qa.src.core.utils import repo_root


def module_path(root: Path, name: str, relative: str) -> Path:
    """Build paths from the central module configuration."""
    return (root / modules.MODULE_BY_NAME[name].path / relative).resolve()


class ModuleConfigurationTests(unittest.TestCase):
    def test_whitespace_and_final_newline_checks_are_last_in_each_module(self) -> None:
        for module in modules.MODULES:
            if module.code is None:
                continue
            with self.subTest(module=module.name):
                configured = list(module.checks)
                self.assertEqual(configured[-2:], list(modules.FINAL_CHECKS))
                for check_id in modules.FINAL_CHECKS:
                    self.assertEqual(configured.count(check_id), 1)

                bound_checks = [
                    check.check_id.removeprefix(f"{module.name}/")
                    for check in cli.selected_checks([module.name])
                    if not check.global_scope
                ]
                self.assertEqual(bound_checks, configured)

    def test_large_file_check_remains_repository_global(self) -> None:
        self.assertIn(
            "repository/added-large-files",
            [check.check_id for check in cli.selected_checks(["repository"])],
        )
        self.assertTrue(
            all(
                check.module == "repository"
                for check in cli.CHECKS
                if check.check_id.endswith("/added-large-files")
            )
        )

    def test_module_files_use_paths_and_exclude_registered_child_modules(self) -> None:
        root = Path(tempfile.gettempdir()).resolve() / "qa-module-paths"
        paths = [
            module_path(root, "infra-publication", "main.tf"),
            module_path(root, "publication-tools", "src/tool.py"),
            module_path(root, "lambda-publisher", "src/publisher.py"),
            module_path(root, "infra-publication", "README.md"),
        ]
        self.assertEqual(
            inputs.files_in_module(root, "infra-publication", paths),
            [paths[0], paths[3]],
        )
        self.assertEqual(
            inputs.files_in_module(root, "publication-tools", paths), [paths[1]]
        )

    def test_demo_ansible_is_a_nested_module(self) -> None:
        root = Path(tempfile.gettempdir()).resolve() / "qa-demo-module-paths"
        tofu_file = module_path(root, "infra-demo", "main.tf")
        playbook = module_path(root, "infra-demo-ansible", "site.yml")
        paths = [tofu_file, playbook]
        self.assertEqual(inputs.files_in_module(root, "infra-demo", paths), [tofu_file])
        self.assertEqual(
            inputs.files_in_module(root, "infra-demo-ansible", paths), [playbook]
        )

    def test_file_checks_receive_only_the_configured_module_directory(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            selected = module_path(root, "code-qa", "tools.py")
            other = module_path(root, "catalog", "main.go")
            for path in (selected, other):
                path.parent.mkdir(parents=True, exist_ok=True)
                path.touch()
            check = next(
                check for check in cli.CHECKS if check.check_id == "code-qa/ruff-lint"
            )

            def inspect(runner: str, args: list[str]) -> tuple[bool, list[str]]:
                self.assertEqual(runner, "code_qa.src.checks.format.ruff")
                manifest = Path(args[args.index("--files-from") + 1])
                self.assertEqual(
                    json.loads(manifest.read_text(encoding="utf-8")),
                    [selected.relative_to(root).as_posix()],
                )
                return True, []

            with patch.object(cli, "run_module", side_effect=inspect) as run:
                self.assertEqual(
                    cli.execute_check(check, check.check_args, root, [selected, other]),
                    (True, []),
                )
            run.assert_called_once()

    def test_changed_paths_are_passed_to_project_checks(self) -> None:
        root = repo_root()
        changed = module_path(root, "infra-bootstrap", "removed.tf")
        check = next(
            check
            for check in cli.CHECKS
            if check.check_id == "infra-bootstrap/tofu-format"
        )

        def inspect(runner: str, args: list[str]) -> tuple[bool, list[str]]:
            self.assertEqual(runner, "code_qa.src.checks.format.tofu")
            self.assertEqual(
                args[args.index("--directory") + 1],
                str(root / modules.MODULE_BY_NAME["infra-bootstrap"].path),
            )
            self.assertEqual(args[args.index("--workspace-root") + 1], str(root))
            manifest = Path(args[args.index("--changed-files-from") + 1])
            self.assertEqual(
                json.loads(manifest.read_text(encoding="utf-8")),
                [changed.relative_to(root).as_posix()],
            )
            return True, []

        with patch.object(cli, "run_module", side_effect=inspect) as run:
            self.assertEqual(
                cli.execute_check(
                    check, check.check_args, root, [changed], scoped=True
                ),
                (True, []),
            )
        run.assert_called_once()

    def test_moving_a_module_only_changes_its_configured_path(self) -> None:
        root = Path(tempfile.gettempdir()).resolve() / "qa-relocation"
        original = modules.ModuleSpec(
            "first-name",
            "old/place",
            "python_code",
            modules.TestSpec("unittest_tests", ("--start-directory", "tests")),
        )
        moved = replace(original, name="new-name", path="elsewhere/new-place")
        original_command, moved_command = (
            cli.test_command(original, root),
            cli.test_command(moved, root),
        )
        self.assertEqual(
            moved_command[moved_command.index("--directory") + 1],
            str(root / moved.path),
        )
        self.assertEqual(
            original_command[original_command.index("--directory") + 2 :],
            moved_command[moved_command.index("--directory") + 2 :],
        )
        self.assertNotIn("--module", moved_command)

    def test_code_qa_uses_generic_unittest_executor(self) -> None:
        command = cli.test_command(modules.MODULE_BY_NAME["code-qa"], repo_root())
        self.assertIn("code_qa.src.checks.tests.unittest_tests", command)
        self.assertEqual(
            command[-4:], ["--start-directory", "tests", "--top-level-directory", ".."]
        )

    def test_only_selected_suites_are_run_and_failures_do_not_stop_following_suites(
        self,
    ) -> None:
        with (
            patch.object(
                cli, "execute_test", side_effect=[(1, ["failure traceback"]), (0, [])]
            ) as run,
            redirect_stdout(StringIO()) as output,
        ):
            self.assertEqual(
                cli.run_test_command(modules=["catalog", "catalog", "code-qa"]), 1
            )
        self.assertEqual(run.call_count, 2)
        self.assertIn("Testing code-qa.. OK", output.getvalue())
        self.assertIn("failure traceback", output.getvalue())
        self.assertIn("Failed modules: catalog", output.getvalue())

    def test_ci_matrix_uses_configured_task_types(self) -> None:
        custom = modules.ModuleSpec(
            "any-name",
            "relocated/catalog",
            code=None,
            tests=modules.TestSpec("go_tests"),
        )
        with patch.object(modules, "MODULES", (custom,)):
            self.assertEqual(
                modules.ci_matrix(),
                {
                    "include": [
                        {"module": "any-name", "java": False, "go": True, "tofu": False}
                    ]
                },
            )


if __name__ == "__main__":
    unittest.main()
