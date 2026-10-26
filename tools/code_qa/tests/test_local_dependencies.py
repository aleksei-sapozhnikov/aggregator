"""Test that QA tools install into the repository instead of global environments."""

from __future__ import annotations

import os
import subprocess
import tempfile
import unittest
from contextlib import redirect_stdout
from io import StringIO
from pathlib import Path
from unittest.mock import patch

from code_qa.src.checks.format import ruff as run_ruff
from code_qa.src.checks.other import yaml_files as run_yaml
from code_qa.src.core import utils
from code_qa.src.core.inputs import FileInputs
from code_qa.src.tools import node as node_toolchain
from code_qa.src.tools import python as python_toolchain


class LocalDependencyTests(unittest.TestCase):
    def test_python_requirements_are_pinned_cached_and_reinstalled_when_changed(
        self,
    ) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            scripts = root / "tools"
            scripts.mkdir()
            requirements = scripts / "requirements.txt"
            requirements.write_text("ruff==0.16.8\n", encoding="utf-8")
            venv = root / ".temp/qa-runtime/venv"
            venv.mkdir(parents=True)
            python = venv / "python"
            with (
                patch.object(utils, "repo_root", return_value=root),
                patch.object(python_toolchain, "project_dir", return_value=scripts),
                patch.object(python_toolchain, "ensure_venv", return_value=python),
                patch.object(python_toolchain, "python_has_module", return_value=True),
                patch.object(
                    python_toolchain.subprocess,
                    "run",
                    return_value=subprocess.CompletedProcess([], 0),
                ) as install,
            ):
                self.assertEqual(
                    python_toolchain.ensure_python_with_module("ruff"), str(python)
                )
                self.assertEqual(
                    python_toolchain.ensure_python_with_module("ruff"), str(python)
                )
                install.assert_called_once()
                command = install.call_args.args[0]
                self.assertEqual(
                    command,
                    [
                        str(python),
                        "-m",
                        "pip",
                        "install",
                        "--requirement",
                        str(requirements),
                    ],
                )
                self.assertEqual(
                    install.call_args.kwargs["env"]["PIP_CACHE_DIR"],
                    str(root / ".temp/qa-runtime/pip-cache"),
                )
                requirements.write_text(
                    "ruff==0.16.8\nPyYAML==6.0.3\n", encoding="utf-8"
                )
                self.assertEqual(
                    python_toolchain.ensure_python_with_module("yaml"), str(python)
                )
                self.assertEqual(install.call_count, 2)

    def test_failed_pip_install_is_not_cached_as_successful(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            (root / "requirements.txt").write_text("ruff==0.16.8\n", encoding="utf-8")
            with (
                patch.object(utils, "repo_root", return_value=root),
                patch.object(python_toolchain, "project_dir", return_value=root),
                patch.object(
                    python_toolchain,
                    "ensure_venv",
                    return_value=root / "venv/python",
                ),
                patch.object(
                    python_toolchain.subprocess,
                    "run",
                    return_value=subprocess.CompletedProcess(
                        [], 1, stdout="", stderr="offline"
                    ),
                ),
                redirect_stdout(StringIO()),
            ):
                self.assertIsNone(python_toolchain.ensure_python_with_module("ruff"))
            self.assertFalse(list(root.rglob("qa-requirements.sha256")))

    def test_ruff_uses_the_private_python_environment(self) -> None:
        with patch.object(
            run_ruff, "ensure_python_with_module", return_value="private-python"
        ):
            self.assertEqual(
                run_ruff.resolve_ruff_cmd(), ["private-python", "-m", "ruff"]
            )

    def test_yaml_runs_in_the_private_venv_even_if_globally_installed(self) -> None:
        with (
            patch.object(
                run_yaml,
                "parse_file_inputs",
                return_value=FileInputs(utils.repo_root(), []),
            ),
            patch.dict(os.environ, {run_yaml.BOOTSTRAP_ENV: ""}),
            patch.object(
                run_yaml, "ensure_python_with_module", return_value="private-python"
            ),
            patch.object(
                run_yaml.subprocess,
                "run",
                return_value=subprocess.CompletedProcess([], 0),
            ) as execute,
        ):
            self.assertEqual(run_yaml.main(), 0)
        self.assertEqual(execute.call_args.args[0][0], "private-python")
        self.assertEqual(execute.call_args.kwargs["env"][run_yaml.BOOTSTRAP_ENV], "1")

    def test_prettier_installation_uses_a_private_prefix_and_npm_cache(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            binary = root / "node_modules/.bin/prettier"

            def install(command: list[str], **_: object) -> subprocess.CompletedProcess:
                if "install" in command:
                    binary.parent.mkdir(parents=True)
                    binary.touch()
                return subprocess.CompletedProcess(command, 0)

            with (
                patch.object(node_toolchain, "runtime_dir", return_value=root),
                patch.object(node_toolchain, "prettier_bin_path", return_value=binary),
                patch.object(node_toolchain, "can_run_command", return_value=True),
                patch.object(
                    node_toolchain.subprocess, "run", side_effect=install
                ) as execute,
            ):
                self.assertEqual(
                    node_toolchain.ensure_prettier_cmd(root), [str(binary)]
                )
                self.assertEqual(
                    node_toolchain.ensure_prettier_cmd(root), [str(binary)]
                )
            commands = [call.args[0] for call in execute.call_args_list]
            self.assertEqual(len(commands), 2)
            self.assertIn("--prefix", commands[1])
            self.assertIn(str(root), commands[1])
            self.assertNotIn("--global", commands[1])
            self.assertEqual(
                execute.call_args.kwargs["env"]["npm_config_cache"],
                str(root / "npm-cache"),
            )

    def test_package_cache_settings_do_not_change_the_users_environment(self) -> None:
        original = os.environ.copy()
        with (
            tempfile.TemporaryDirectory() as temporary,
            patch.object(python_toolchain, "runtime_dir", return_value=Path(temporary)),
            patch.object(node_toolchain, "runtime_dir", return_value=Path(temporary)),
        ):
            env = utils.dependency_environment()
            python_env = python_toolchain.python_environment()
            node_env = node_toolchain.node_environment()
            self.assertNotIn("PIP_CACHE_DIR", env)
            self.assertNotIn("npm_config_cache", env)
            self.assertTrue(
                Path(python_env["PIP_CACHE_DIR"]).is_relative_to(Path(temporary))
            )
            self.assertTrue(
                Path(node_env["npm_config_cache"]).is_relative_to(Path(temporary))
            )
        self.assertEqual(dict(os.environ), original)


if __name__ == "__main__":
    unittest.main()
