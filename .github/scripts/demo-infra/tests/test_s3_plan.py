"""Test private plan transfer without AWS credentials or network access."""

from __future__ import annotations

import hashlib
import os
import subprocess
import tempfile
import unittest
from pathlib import Path

SCRIPT = Path(__file__).resolve().parents[1] / "s3-plan.sh"

FAKE_AWS = """#!/usr/bin/env python3
import os
import shutil
import sys
from pathlib import Path

args = sys.argv[1:]
if args[:2] == ["s3api", "put-object"]:
    assert args[args.index("--if-none-match") + 1] == "*", args
    assert args[args.index("--key") + 1] == os.environ["EXPECTED_KEY"], args
    object_path = Path(os.environ["FAKE_S3_OBJECT"])
    if object_path.exists():
        sys.exit(41)
    shutil.copyfile(args[args.index("--body") + 1], object_path)
elif args[:2] == ["s3api", "get-object"]:
    assert args[args.index("--key") + 1] == os.environ["EXPECTED_KEY"], args
    shutil.copyfile(os.environ["FAKE_S3_OBJECT"], args[-1])
else:
    sys.exit(42)
print("{}")
"""


class SavedPlanS3TransferTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.tmpdir = self.root / "runner"
        self.tmpdir.mkdir()
        self.bin_dir = self.root / "bin"
        self.bin_dir.mkdir()
        fake_aws = self.bin_dir / "aws"
        fake_aws.write_text(FAKE_AWS, encoding="utf-8")
        fake_aws.chmod(0o755)
        self.artifact = self.root / "object"
        self.outputs = self.root / "github-output"
        self.plan = self.tmpdir / "demo.tfplan"
        self.plan.write_bytes(b"synthetic opentofu saved plan binary")
        self.env = dict(os.environ)
        self.env.update(
            {
                "PATH": f"{self.bin_dir}:{os.environ['PATH']}",
                "RUNNER_TEMP": str(self.tmpdir),
                "GITHUB_RUN_ID": "123456",
                "GITHUB_RUN_ATTEMPT": "2",
                "GITHUB_OUTPUT": str(self.outputs),
                "AWS_REGION": "eu-central-1",
                "FAKE_S3_OBJECT": str(self.artifact),
                "EXPECTED_KEY": "plans/demo/123456/2/demo.tfplan",
            }
        )

    def run_transfer(self, command: str, *, expect_success: bool) -> subprocess.CompletedProcess[str]:
        process = subprocess.run(
            ["bash", str(SCRIPT), command],
            env=self.env,
            capture_output=True,
            text=True,
            check=False,
        )
        if expect_success:
            self.assertEqual(process.returncode, 0, process.stderr)
        else:
            self.assertNotEqual(process.returncode, 0)
        return process

    def test_upload_then_download_verified_by_job_output(self) -> None:
        self.run_transfer("upload", expect_success=True)
        self.assertEqual(self.artifact.read_bytes(), self.plan.read_bytes())
        checksum = hashlib.sha256(self.plan.read_bytes()).hexdigest()
        self.assertIn(f"plan_sha256={checksum}", self.outputs.read_text())
        self.env["EXPECTED_PLAN_SHA256"] = checksum
        self.run_transfer("download", expect_success=True)
        restored = self.tmpdir / "approved-plan" / "demo.tfplan"
        self.assertEqual(restored.read_bytes(), self.plan.read_bytes())

    def test_prevent_overwriting_an_existing_plan_key(self) -> None:
        self.run_transfer("upload", expect_success=True)
        self.run_transfer("upload", expect_success=False)

    def test_refuse_modified_s3_object(self) -> None:
        self.run_transfer("upload", expect_success=True)
        self.env["EXPECTED_PLAN_SHA256"] = hashlib.sha256(self.plan.read_bytes()).hexdigest()
        self.artifact.write_bytes(b"unexpected plan")
        result = self.run_transfer("download", expect_success=False)
        self.assertIn("SHA-256 mismatch", result.stderr)
        self.assertFalse((self.tmpdir / "approved-plan" / "demo.tfplan").exists())

    def test_refuse_missing_or_invalid_checksum(self) -> None:
        self.run_transfer("upload", expect_success=True)
        self.env["EXPECTED_PLAN_SHA256"] = "invalid"
        result = self.run_transfer("download", expect_success=False)
        self.assertIn("Invalid expected plan SHA-256", result.stderr)


if __name__ == "__main__":
    unittest.main()
