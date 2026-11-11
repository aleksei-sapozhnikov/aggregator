"""Verify Git Layer builder selects Docker first and Podman as a fallback."""

from __future__ import annotations

import subprocess
import sys
import tempfile
import unittest
import zipfile
from pathlib import Path
from unittest.mock import MagicMock, call, patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

import git_layer


class ContainerRuntimeTests(unittest.TestCase):
    def test_docker_is_preferred_when_both_are_available(self):
        with patch.object(git_layer.shutil, "which", side_effect=[
            "/usr/bin/docker",
        ]) as which:
            self.assertEqual("/usr/bin/docker", git_layer._container_runtime())
        which.assert_called_once_with("docker")

    def test_podman_is_used_when_docker_is_missing(self):
        with patch.object(
            git_layer.shutil, "which", side_effect=[None, "/usr/bin/podman"]
        ) as which:
            self.assertEqual("/usr/bin/podman", git_layer._container_runtime())
        self.assertEqual(
            [call("docker"), call("podman")], which.call_args_list
        )

    def test_missing_engines_raise_a_clear_error(self):
        with patch.object(git_layer.shutil, "which", return_value=None):
            with self.assertRaisesRegex(RuntimeError, "Docker or Podman"):
                git_layer._container_runtime()

    def test_command_uses_selected_runtime(self):
        completed = subprocess.CompletedProcess(
            args=["/usr/bin/podman", "create"], returncode=0,
            stdout="container-id\n", stderr="",
        )
        with patch.object(
            git_layer.subprocess, "run", return_value=completed
        ) as run:
            result = git_layer._container_command(
                "/usr/bin/podman", "create", "--platform", "linux/amd64",
                git_layer.IMAGE,
            )
        self.assertEqual("container-id", result)
        self.assertEqual("/usr/bin/podman", run.call_args.args[0][0])

    def test_failed_selected_engine_does_not_switch_engines(self):
        with patch.object(
            git_layer.subprocess, "run",
            side_effect=subprocess.CalledProcessError(
                125, ["/usr/bin/docker", "build"]
            ),
        ), patch.object(git_layer.shutil, "which") as which:
            with self.assertRaisesRegex(RuntimeError, "docker"):
                git_layer._container_command(
                    "/usr/bin/docker", "build"
                )
        which.assert_not_called()

    def test_failed_build_reports_podman_error_and_failing_step(self):
        error = subprocess.CalledProcessError(
            125, ["C:/Podman/podman.exe", "build"],
            stderr="Cannot connect to the Podman socket",
        )
        with patch.object(
            git_layer.subprocess, "run", side_effect=error
        ):
            with self.assertRaises(RuntimeError) as raised:
                git_layer._container_command(
                    "C:/Podman/podman.exe", "build",
                )
        message = str(raised.exception)
        self.assertIn("podman.exe build failed (exit 125)", message)
        self.assertIn("Cannot connect to the Podman socket", message)

    def test_failed_build_reports_stdout_and_stderr(self):
        error = subprocess.CalledProcessError(
            1, ["/usr/bin/podman", "build"],
            output="STEP 3/4: RUN cp missing\ncp: cannot stat missing",
            stderr="Error building at STEP 3",
        )
        with patch.object(git_layer.subprocess, "run", side_effect=error):
            with self.assertRaises(RuntimeError) as raised:
                git_layer._container_command("/usr/bin/podman", "build")
        message = str(raised.exception)
        self.assertIn("cp: cannot stat missing", message)
        self.assertIn("Error building at STEP 3", message)

    def test_failed_build_truncates_container_diagnostics(self):
        error = subprocess.CalledProcessError(
            1, ["/usr/bin/podman", "build"],
            stderr="x" * 6000,
        )
        with patch.object(git_layer.subprocess, "run", side_effect=error):
            with self.assertRaises(RuntimeError) as raised:
                git_layer._container_command("/usr/bin/podman", "build")
        self.assertLess(len(str(raised.exception)), 5200)

    def test_dockerfile_collects_dependencies_without_ldd_file_headers(self):
        dockerfile = (ROOT / "git-layer" / "Dockerfile").read_text(
            encoding="utf-8"
        )
        # Running ldd with multiple binaries introduces filename headers
        # such as "/usr/bin/git:" that are not valid library paths.
        self.assertIn("ldd /layer/bin/git > /tmp/git-libs", dockerfile)
        self.assertIn(
            "ldd /layer/libexec/git-core/git-remote-https >> /tmp/git-libs",
            dockerfile,
        )
        self.assertIn('git --exec-path', dockerfile)

    def test_layer_build_uses_podman_for_every_step(self):
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / "git-layer.zip"
            calls = []

            def command(runtime, *args):
                calls.append((runtime, *args))
                if args[0] == "create":
                    return "container-id"
                if args[0] == "cp":
                    stage = Path(args[-1])
                    binary = stage / "bin/git"
                    helper = stage / "libexec/git-core/git-remote-https"
                    library = stage / "lib/libssl.so"
                    for path in (binary, helper, library):
                        path.parent.mkdir(parents=True, exist_ok=True)
                        path.write_bytes(b"test-binary")
                return ""

            with patch.object(
                git_layer, "_container_runtime", return_value="/usr/bin/podman"
            ), patch.object(
                git_layer, "_container_command", side_effect=command
            ):
                git_layer.build_git_layer(output)

            self.assertTrue(output.is_file())
            self.assertEqual(
                ["build", "create", "cp", "rm"],
                [item[1] for item in calls],
            )
            self.assertTrue(
                all(item[0] == "/usr/bin/podman" for item in calls)
            )
            with zipfile.ZipFile(output) as archive:
                self.assertIn("bin/git", archive.namelist())
                self.assertIn(
                    "libexec/git-core/git-remote-https",
                    archive.namelist(),
                )


if __name__ == "__main__":
    unittest.main()
