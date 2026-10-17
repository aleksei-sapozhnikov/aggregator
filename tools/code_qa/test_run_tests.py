"""Tests for the cross-platform, per-module QA test runner."""

from __future__ import annotations

import subprocess
import sys
import tempfile
import unittest
from contextlib import redirect_stdout
from io import StringIO
from pathlib import Path
from unittest.mock import patch

import run_tests


class TestRunnerTests(unittest.TestCase):
    """Validate module commands, reporting, and failure isolation."""

    def test_java_uses_maven_and_catalog_uses_go(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            home = root / "fake-jdk-25"
            with (
                patch.object(run_tests, "resolve_java_home", return_value=home) as java,
                patch.object(
                    run_tests, "resolve_maven_command", return_value="mvn.cmd"
                ) as resolve,
            ):
                module = run_tests.build_module(root, "aggregator")
            self.assertEqual(module.command, ["mvn.cmd", "-B", "test"])
            self.assertEqual(module.env["JAVA_HOME"], str(home))
            self.assertIn(
                "--sun-misc-unsafe-memory-access=allow",
                module.env["MAVEN_OPTS"].split(),
            )
            self.assertTrue(module.env["PATH"].startswith(str(home / "bin")))
            java.assert_called_once_with(root)
            resolve.assert_called_once_with(root)
            self.assertEqual(
                run_tests.build_module(root, "catalog").command,
                ["go", "test", "-v", "./..."],
            )

    def test_missing_maven_prevents_java_tests_from_starting(self) -> None:
        with (
            patch.object(run_tests, "resolve_java_home", return_value=Path("/jdk")),
            patch.object(run_tests, "resolve_maven_command", return_value=None),
            patch.object(run_tests, "execute_module") as execute,
        ):
            self.assertIsNone(run_tests.build_module(Path("/repo"), "aggregator"))
            execute.assert_not_called()

    def test_missing_jdk_prevents_java_tests_from_starting(self) -> None:
        with (
            patch.object(run_tests, "resolve_java_home", return_value=None),
            patch.object(run_tests, "resolve_maven_command") as maven,
        ):
            self.assertIsNone(run_tests.build_module(Path("/repo"), "aggregator"))
        maven.assert_not_called()

    def test_java_test_subprocess_receives_jdk_environment(self) -> None:
        module = run_tests.TestModule(
            "aggregator", Path("/repo"), ["mvn", "-B", "test"],
            {"JAVA_HOME": "/qa-jdk", "PATH": "/qa-jdk/bin"},
        )
        with patch.object(
            run_tests.subprocess, "run",
            return_value=subprocess.CompletedProcess([], 0),
        ) as execute:
            self.assertEqual(run_tests.execute_module(module), 0)
        self.assertEqual(execute.call_args.kwargs["env"], module.env)

    def test_ui_uses_verbose_vitest_and_locked_dependencies(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            with patch.object(
                run_tests, "ensure_ui_test_dependencies", return_value=True
            ) as setup:
                module = run_tests.build_module(root, "aggregator-ui")
            self.assertIsNotNone(module)
            self.assertEqual(
                module.command,
                [
                    run_tests.platform_command("npm"),
                    "test",
                    "--",
                    "--reporter=verbose",
                    "--no-color",
                ],
            )
            self.assertEqual(module.env["NO_COLOR"], "1")
            self.assertNotIn("FORCE_COLOR", module.env)
            setup.assert_called_once_with(root / "services-core" / "aggregator-ui")

    def test_ui_removes_inherited_force_color(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            with (
                patch.dict(run_tests.os.environ, {"FORCE_COLOR": "3"}),
                patch.object(run_tests, "ensure_ui_test_dependencies", return_value=True),
            ):
                module = run_tests.build_module(root, "aggregator-ui")
            self.assertEqual(module.env["NO_COLOR"], "1")
            self.assertNotIn("FORCE_COLOR", module.env)

    def test_ai_agent_uses_python_from_resolver(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            with patch.object(
                run_tests, "resolve_ai_agent_python", return_value="python-for-tests"
            ):
                module = run_tests.build_module(root, "ai-agent")
            self.assertEqual(
                module.command,
                [
                    "python-for-tests",
                    "-m",
                    "pytest",
                    "-v",
                    "tests",
                ],
            )

    def test_qa_runner_discovers_its_own_unit_tests(self) -> None:
        module = run_tests.build_module(Path("/repo"), "code-qa")
        self.assertEqual(
            module.command,
            [
                sys.executable,
                "-m",
                "unittest",
                "discover",
                "-s",
                "tools/code_qa",
                "-p",
                "test_*.py",
                "-v",
            ],
        )

    def test_all_modules_run_even_when_one_fails(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            names = ["aggregator", "catalog", "code-qa"]
            for name in names[:2]:
                (root / "services-core" / name).mkdir(parents=True)
            calls = []

            def execute(module: run_tests.TestModule) -> int:
                calls.append(module.name)
                return 1 if module.name == "catalog" else 0

            def prepared_module(root_dir: Path, name: str) -> run_tests.TestModule:
                return run_tests.TestModule(name, root_dir, ["mock-test-command"])

            output = StringIO()
            with (
                patch.object(
                    run_tests, "build_module", side_effect=prepared_module
                ) as prepare,
                patch.object(run_tests, "execute_module", side_effect=execute),
                redirect_stdout(output),
            ):
                rc = run_tests.run_modules(names, root)

            self.assertEqual(rc, 1)
            self.assertEqual(
                [call.args[1] for call in prepare.call_args_list], names
            )
            self.assertEqual(calls, names)
            self.assertIn("Testing aggregator.. OK", output.getvalue())
            self.assertIn("Testing catalog.. FAILED", output.getvalue())
            self.assertIn("Failed modules: catalog", output.getvalue())

    def test_missing_module_does_not_hide_remaining_modules(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            output = StringIO()
            with (
                patch.object(run_tests, "execute_module", return_value=0) as execute,
                redirect_stdout(output),
            ):
                self.assertEqual(run_tests.run_modules(["catalog", "code-qa"], root), 1)
            execute.assert_called_once()
            self.assertIn("Missing module directory", output.getvalue())

    def test_missing_test_executable_is_a_failure(self) -> None:
        module = run_tests.TestModule("catalog", Path("/repo"), ["go", "test", "./..."])
        with (
            patch.object(
                run_tests.subprocess, "run", side_effect=FileNotFoundError("go")
            ),
            redirect_stdout(StringIO()),
        ):
            self.assertEqual(run_tests.execute_module(module), 1)

    def test_execute_module_preserves_subprocess_status(self) -> None:
        module = run_tests.TestModule(
            "aggregator", Path("/repo"), ["mvn", "-B", "test"]
        )
        with (
            patch.object(
                run_tests.subprocess,
                "run",
                return_value=subprocess.CompletedProcess([], 2),
            ) as execute,
            redirect_stdout(StringIO()),
        ):
            self.assertEqual(run_tests.execute_module(module), 2)
        self.assertEqual(execute.call_args.args[0], module.command)
        self.assertEqual(execute.call_args.kwargs["cwd"], module.directory)


if __name__ == "__main__":
    unittest.main()
