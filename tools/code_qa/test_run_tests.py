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
            self.assertEqual(module.command, ["mvn.cmd", "-q", "-B", "test"])
            with (
                patch.object(run_tests, "resolve_java_home", return_value=home),
                patch.object(
                    run_tests, "resolve_maven_command", return_value="mvn.cmd"
                ),
            ):
                verbose_module = run_tests.build_module(
                    root, "aggregator", verbose=True
                )
            self.assertEqual(verbose_module.command, ["mvn.cmd", "-B", "test"])
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
                ["go", "test", "./..."],
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
            "aggregator",
            Path("/repo"),
            ["mvn", "-B", "test"],
            {"JAVA_HOME": "/qa-jdk", "PATH": "/qa-jdk/bin"},
        )
        with patch.object(
            run_tests.subprocess,
            "run",
            return_value=subprocess.CompletedProcess([], 0),
        ) as execute:
            self.assertEqual(run_tests.execute_module(module), (0, ""))
        self.assertEqual(execute.call_args.kwargs["env"], module.env)

    def test_ui_uses_compact_vitest_and_locked_dependencies(self) -> None:
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
                    "--reporter=dot",
                    "--no-color",
                ],
            )
            self.assertEqual(module.env["NO_COLOR"], "1")
            self.assertNotIn("FORCE_COLOR", module.env)
            setup.assert_called_once_with(root / "services-core" / "aggregator-ui")
            with patch.object(
                run_tests, "ensure_ui_test_dependencies", return_value=True
            ):
                verbose_module = run_tests.build_module(
                    root, "aggregator-ui", verbose=True
                )
            self.assertIn("--reporter=verbose", verbose_module.command)

    def test_ui_removes_inherited_force_color(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            with (
                patch.dict(run_tests.os.environ, {"FORCE_COLOR": "3"}),
                patch.object(
                    run_tests, "ensure_ui_test_dependencies", return_value=True
                ),
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
                verbose_module = run_tests.build_module(root, "ai-agent", verbose=True)
            self.assertEqual(
                module.command,
                [
                    "python-for-tests",
                    "-m",
                    "pytest",
                    "-q",
                    "tests",
                ],
            )
            self.assertIn("-v", verbose_module.command)

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
            ],
        )
        self.assertIn(
            "-v",
            run_tests.build_module(Path("/repo"), "code-qa", verbose=True).command,
        )

    def test_all_modules_run_even_when_one_fails(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            names = ["aggregator", "catalog", "code-qa"]
            for name in names[:2]:
                (root / "services-core" / name).mkdir(parents=True)
            calls = []

            def execute(
                module: run_tests.TestModule, *, verbose: bool = False
            ) -> tuple[int, str]:
                calls.append(module.name)
                return (1, "catalog failed") if module.name == "catalog" else (0, "")

            def prepared_module(
                root_dir: Path, name: str, *, verbose: bool = False
            ) -> run_tests.TestModule:
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
            self.assertEqual([call.args[1] for call in prepare.call_args_list], names)
            self.assertEqual(calls, names)
            self.assertIn("Testing aggregator.. OK", output.getvalue())
            self.assertIn("Testing catalog.. FAILED", output.getvalue())
            self.assertIn("Failed modules: catalog", output.getvalue())
            self.assertIn("catalog failed", output.getvalue())

    def test_missing_module_does_not_hide_remaining_modules(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            output = StringIO()
            with (
                patch.object(
                    run_tests, "execute_module", return_value=(0, "")
                ) as execute,
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
            self.assertEqual(
                run_tests.execute_module(module),
                (1, "Could not start catalog tests: go"),
            )

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
            self.assertEqual(
                run_tests.execute_module(module),
                (2, "Test command exited with status 2."),
            )
        self.assertEqual(execute.call_args.args[0], module.command)
        self.assertEqual(execute.call_args.kwargs["cwd"], module.directory)

    def test_success_output_is_suppressed_by_default(self) -> None:
        module = run_tests.TestModule("catalog", Path("/repo"), ["go", "test", "./..."])
        with patch.object(
            run_tests.subprocess,
            "run",
            return_value=subprocess.CompletedProcess(
                [], 0, stdout="all tests passed\n"
            ),
        ) as execute:
            self.assertEqual(run_tests.execute_module(module), (0, ""))
        self.assertEqual(execute.call_args.kwargs["stdout"], subprocess.PIPE)
        self.assertEqual(execute.call_args.kwargs["stderr"], subprocess.STDOUT)
        self.assertEqual(execute.call_args.kwargs["encoding"], "utf-8")
        self.assertEqual(execute.call_args.kwargs["errors"], "replace")

    def test_failure_output_is_retained(self) -> None:
        module = run_tests.TestModule("catalog", Path("/repo"), ["go", "test", "./..."])
        with patch.object(
            run_tests.subprocess,
            "run",
            return_value=subprocess.CompletedProcess(
                [], 1, stdout="FAIL: TestBadInput\n"
            ),
        ):
            self.assertEqual(
                run_tests.execute_module(module), (1, "FAIL: TestBadInput\n")
            )

    def test_verbose_mode_forwards_runner_output(self) -> None:
        module = run_tests.TestModule(
            "catalog", Path("/repo"), ["go", "test", "-v", "./..."]
        )
        with (
            patch.object(
                run_tests.subprocess,
                "run",
                return_value=subprocess.CompletedProcess([], 0),
            ) as execute,
            redirect_stdout(StringIO()) as output,
        ):
            self.assertEqual(run_tests.execute_module(module, verbose=True), (0, ""))
        self.assertIn("command: go test -v ./...", output.getvalue())
        self.assertNotIn("stdout", execute.call_args.kwargs)
        self.assertNotIn("stderr", execute.call_args.kwargs)

    def test_compact_reporting_prints_failure_details_only(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            output = StringIO()
            with (
                patch.object(
                    run_tests,
                    "build_module",
                    side_effect=lambda root, name, verbose=False: run_tests.TestModule(
                        name, root, ["mock-test-command"]
                    ),
                ),
                patch.object(
                    run_tests,
                    "execute_module",
                    side_effect=[(0, ""), (1, "failure traceback\n")],
                ),
                redirect_stdout(output),
            ):
                rc = run_tests.run_modules(["code-qa", "code-qa"], root)
            self.assertEqual(rc, 1)
            self.assertIn("Testing code-qa.. OK", output.getvalue())
            self.assertIn("Testing code-qa.. FAILED", output.getvalue())
            self.assertIn("failure traceback", output.getvalue())
            self.assertEqual(output.getvalue().count("command: mock-test-command"), 1)

    def test_cli_accepts_verbose_flag(self) -> None:
        with (
            patch.object(
                sys, "argv", ["run_tests.py", "--module", "catalog", "--verbose"]
            ),
            patch.object(run_tests, "run_modules", return_value=0) as run,
        ):
            self.assertEqual(run_tests.main(), 0)
        run.assert_called_once_with(["catalog"], verbose=True)


if __name__ == "__main__":
    unittest.main()
