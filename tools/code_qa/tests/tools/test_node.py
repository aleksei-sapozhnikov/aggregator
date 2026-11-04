"""Verify locked package-local Node dependency installation."""

import subprocess
import tempfile
import unittest
from contextlib import redirect_stdout
from io import StringIO
from pathlib import Path
from unittest.mock import patch

from code_qa.src.tools import node


class NodeDependenciesTests(unittest.TestCase):
    def test_existing_binary_skips_installation(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            directory = Path(temporary)
            binary = directory / "node_modules/.bin" / node.platform_command("vitest")
            binary.parent.mkdir(parents=True)
            binary.touch()
            with patch.object(node.subprocess, "run") as run:
                self.assertTrue(
                    node.ensure_dependencies(directory, directory, "vitest")
                )
            run.assert_not_called()

    def test_missing_lockfile_prevents_installation(self) -> None:
        with (
            tempfile.TemporaryDirectory() as temporary,
            patch.object(node.subprocess, "run") as run,
            redirect_stdout(StringIO()),
        ):
            self.assertFalse(
                node.ensure_dependencies(Path(temporary), Path(temporary), "vitest")
            )
        run.assert_not_called()

    def test_npm_ci_uses_package_directory_and_local_cache(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            directory = Path(temporary) / "package"
            directory.mkdir()
            (directory / "package-lock.json").write_text("{}", encoding="utf-8")

            def installed(*args, **kwargs):
                binary = directory / "node_modules/.bin" / node.platform_command("tsc")
                binary.parent.mkdir(parents=True)
                binary.touch()
                return subprocess.CompletedProcess([], 0)

            with (
                patch.object(node.subprocess, "run", side_effect=installed) as run,
                redirect_stdout(StringIO()),
            ):
                self.assertTrue(
                    node.ensure_dependencies(directory, Path(temporary), "tsc")
                )
            self.assertEqual(
                run.call_args.args[0], [node.platform_command("npm"), "ci"]
            )
            self.assertEqual(run.call_args.kwargs["cwd"], directory)
            self.assertEqual(
                run.call_args.kwargs["env"]["npm_config_cache"],
                str(Path(temporary) / ".local/qa-runtime/npm-cache"),
            )
