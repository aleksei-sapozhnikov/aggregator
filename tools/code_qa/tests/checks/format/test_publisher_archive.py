"""Check that Publisher validation prepares its local Lambda ZIP."""

from __future__ import annotations

import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from code_qa.src.checks.format import publisher_archive
from code_qa.src.core import cli


class PublisherArchiveTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.workspace = Path(self.tmp.name)
        self.publisher = self.workspace / "tools/publisher"
        self.directory = self.publisher / "infra/resources"
        self.directory.mkdir(parents=True)
        (self.publisher / "publisher.py").write_text(
            "# Simulated Publisher builder\n", encoding="utf-8"
        )

    def test_qa_builds_the_archive_before_resource_validation(self) -> None:
        checks = [spec.check_id for spec in cli.selected_checks(["publisher"])]
        self.assertLess(
            checks.index("publisher/resources/publisher-archive"),
            checks.index("publisher/resources/tofu-validate"),
        )
        archive = self.publisher / "build/publisher.zip"

        def build(_args: list[str], **_kwargs: object) -> subprocess.CompletedProcess:
            archive.parent.mkdir(parents=True)
            archive.write_bytes(b"fixture")
            return subprocess.CompletedProcess([], 0)

        with patch.object(
            publisher_archive.subprocess, "run", side_effect=build
        ) as call:
            self.assertEqual(publisher_archive.run(self.directory, self.workspace), 0)
        self.assertEqual(
            call.call_args.args[0],
            [sys.executable, str(self.publisher / "publisher.py"), "build"],
        )
        self.assertEqual(call.call_args.kwargs["cwd"], self.publisher)

    def test_missing_archive_fails_validation_preparation(self) -> None:
        with patch.object(
            publisher_archive.subprocess,
            "run",
            return_value=subprocess.CompletedProcess([], 0),
        ):
            self.assertEqual(publisher_archive.run(self.directory, self.workspace), 1)

    def test_wrong_root_does_not_launch_the_builder(self) -> None:
        with patch.object(publisher_archive.subprocess, "run") as call:
            self.assertEqual(publisher_archive.run(self.publisher, self.workspace), 1)
        call.assert_not_called()


if __name__ == "__main__":
    unittest.main()
