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
                    if not check.global_scope and check.scope_path is None
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

    def test_module_files_include_nested_directories_but_not_other_modules(self) -> None:
        root = Path(tempfile.gettempdir()).resolve() / "qa-module-paths"
        paths = [
            module_path(root, "publisher", "infra/main.tf"),
            module_path(root, "publisher", "infra/tools/src/tool.py"),
            module_path(
                root, "publisher", "lambda_publisher/src/lambda_publisher/handler.py"
            ),
            module_path(root, "code-qa", "src/core/cli.py"),
            module_path(root, "publisher", "README.md"),
        ]
        self.assertEqual(
            inputs.files_in_module(root, "publisher", paths),
            [paths[0], paths[1], paths[2], paths[4]],
        )
        self.assertEqual(
            inputs.files_in_module(root, "code-qa", paths), [paths[3]]
        )

    def test_python_modules_keep_implementation_in_src(self) -> None:
        root = repo_root()
        for module in modules.MODULES:
            if module.code != "python_code" or module.path == ".":
                continue
            with self.subTest(module=module.name):
                self.assertTrue((root / module.path / "src").is_dir())

    def test_registered_modules_are_second_level_folders(self) -> None:
        root = repo_root()
        from code_qa.module_checks import registry

        paths = [
            module.path for module in modules.MODULES if module.name != "repository"
        ]
        self.assertEqual(len(paths), len(set(paths)))
        for path in paths:
            with self.subTest(path=path):
                self.assertEqual(len(Path(path).parts), 2)
                self.assertTrue((root / path).is_dir())
        self.assertEqual(
            set(paths),
            {
                f"{group}/{directory.name}"
                for group in ("services", "environments", "deploy", "tools")
                for directory in (root / group).iterdir()
                if directory.is_dir()
                and directory.name not in {
                    "__pycache__",
                    "node_modules",
                    "build",
                    "dist",
                }
                and not directory.name.startswith(".")
            },
        )
        self.assertEqual(len(registry.MODULE_IMPORTS), len(paths))

    def test_scoped_publication_checks_use_their_own_directory(self) -> None:
        root = repo_root()
        check = next(
            check for check in cli.CHECKS
            if check.check_id == "publisher/infra/tofu-validate"
        )
        self.assertEqual(check.module, "publisher")
        self.assertEqual(check.scope_path, "tools/publisher/infra")
        with patch.object(cli, "run_module", return_value=(True, [])) as run:
            self.assertEqual(
                cli.execute_check(check, check.check_args, root, []), (True, [])
            )
        self.assertEqual(
            run.call_args.args[1][run.call_args.args[1].index("--directory") + 1],
            str(root / "tools/publisher/infra"),
        )

    def test_shared_infra_roots_and_demo_ansible_are_registered(self) -> None:
        for name in ("administration", "state"):
            self.assertIn(
                f"shared/{name}/tflint", [c.check_id for c in cli.CHECKS]
            )
        self.assertIn("demo/infra/tflint", [c.check_id for c in cli.CHECKS])
        self.assertIn(
            "demo/ansible/ansible-lint", [c.check_id for c in cli.CHECKS]
        )
        self.assertEqual(
            modules.MODULE_BY_NAME["demo"].tests.kind,
            "unittest_tests",
        )
        self.assertIn(
            "publisher/infra/tflint", [c.check_id for c in cli.CHECKS]
        )
        self.assertIn(
            "publisher/infra-tools/ruff-lint",
            [c.check_id for c in cli.CHECKS],
        )
        self.assertEqual(
            modules.MODULE_BY_NAME["publisher"].scoped_tests[0].tests.kind,
            "unittest_tests",
        )

    def test_publisher_runs_both_python_test_suites(self) -> None:
        root = repo_root()
        commands = cli.test_commands(modules.MODULE_BY_NAME["publisher"], root)
        self.assertEqual(
            [label for label, _ in commands],
            ["publisher (infra-tools)", "publisher (lambda_publisher)"],
        )
        paths = [
            Path(command[command.index("--directory") + 1])
            for _, command in commands
        ]
        self.assertEqual(
            paths,
            [
                root / "tools/publisher/infra/tools",
                root / "tools/publisher/lambda_publisher",
            ],
        )

    def test_shared_tflint_config_is_forwarded_to_scoped_checks(self) -> None:
        root = repo_root()
        config_path = (root / ".tflint.hcl").resolve()
        check = next(c for c in cli.CHECKS if c.check_id == "shared/state/tflint")

        def inspect(runner: str, args: list[str]) -> tuple[bool, list[str]]:
            self.assertEqual(runner, "code_qa.src.checks.format.tflint")
            manifest = Path(args[args.index("--changed-files-from") + 1])
            self.assertEqual(
                json.loads(manifest.read_text(encoding="utf-8")),
                [".tflint.hcl"],
            )
            return True, []

        with patch.object(cli, "run_module", side_effect=inspect):
            self.assertEqual(
                cli.execute_check(
                    check, check.check_args, root, [config_path], scoped=True
                ),
                (True, []),
            )

    def test_demo_ansible_is_scoped_under_the_parent_module(self) -> None:
        root = Path(tempfile.gettempdir()).resolve() / "qa-demo-module-paths"
        tofu_file = module_path(root, "demo", "infra/main.tf")
        playbook = module_path(root, "demo", "ansible/site.yml")
        self.assertEqual(
            inputs.files_in_module(root, "demo", [tofu_file, playbook]),
            [tofu_file, playbook],
        )
        check = next(
            c for c in cli.CHECKS
            if c.check_id == "demo/ansible/ansible-lint"
        )
        self.assertEqual(check.scope_path, "environments/demo/ansible")
        command = cli.test_commands(modules.MODULE_BY_NAME["demo"], root)[0][1]
        self.assertEqual(
            command[command.index("--directory") + 1],
            str(root / "environments/demo"),
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
        changed = module_path(root, "shared", "administration/removed.tf")
        check = next(
            check
            for check in cli.CHECKS
            if check.check_id == "shared/administration/tofu-format"
        )

        def inspect(runner: str, args: list[str]) -> tuple[bool, list[str]]:
            self.assertEqual(runner, "code_qa.src.checks.format.tofu")
            self.assertEqual(
                args[args.index("--directory") + 1],
                str(root / "environments/shared/administration"),
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

    def test_administration_module_uses_the_current_directory(self) -> None:
        module = modules.MODULE_BY_NAME["shared"]
        self.assertEqual(module.path, "environments/shared")
        self.assertTrue((repo_root() / module.path).is_dir())
        self.assertIn("shared/administration/tofu-validate", [c.check_id for c in cli.CHECKS])

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
        from code_qa.module_checks import registry

        with patch.object(registry, "MODULES", (custom,)):
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
