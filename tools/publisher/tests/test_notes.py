"""Verify private guidance synchronization without connecting to AWS."""

from __future__ import annotations

import sys
import tempfile
import unittest
import zipfile
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import notes


class GuidancePathTests(unittest.TestCase):
    def test_location_is_under_repository_root(self):
        root = Path(notes.__file__).resolve().parents[2]
        self.assertEqual(root / ".local" / "publisher" / "codex-publication-preparation", notes.BUNDLE_DIR)
        self.assertEqual(notes.BUNDLE_DIR / ".remote-etag", notes.ETAG)


class ConfirmationTests(unittest.TestCase):
    def test_yes_required_for_push(self):
        with patch("builtins.input", return_value="yes"):
            notes.confirm("push", False)
        for response in ("", "y", "YES", "yes ", "no"):
            with self.subTest(response=response):
                with patch("builtins.input", return_value=response):
                    with self.assertRaisesRegex(RuntimeError, "exactly 'yes'"):
                        notes.confirm("push", False)

    def test_yes_required_for_force_pull(self):
        with patch("builtins.input", return_value="yes"):
            notes.confirm("pull", True)
        with patch("builtins.input", return_value="no"):
            with self.assertRaisesRegex(RuntimeError, "cancelled"):
                notes.confirm("pull", True)

    def test_noninteractive_confirmation_is_rejected(self):
        with patch("builtins.input", side_effect=EOFError):
            with self.assertRaisesRegex(RuntimeError, "interactive confirmation"):
                notes.confirm("push", False)

    def test_no_confirmation_prevents_aws_access(self):
        for action in ("push", "pull"):
            with self.subTest(action=action):
                with patch.object(sys, "argv", ["notes.py", action]), patch("builtins.input", return_value="no"), patch.object(notes, "authorize") as authorize, patch.object(notes, action) as operation:
                    with self.assertRaises(SystemExit) as raised:
                        notes.main()
                    self.assertEqual(1, raised.exception.code)
                    authorize.assert_not_called()
                    operation.assert_not_called()

    def test_yes_authorizes_operation(self):
        for action in ("push", "pull"):
            with self.subTest(action=action):
                with patch.object(sys, "argv", ["notes.py", action]), patch("builtins.input", return_value="yes"), patch.object(notes, "authorize") as authorize, patch.object(notes, action) as operation:
                    notes.main()
                    authorize.assert_called_once_with()
                    operation.assert_called_once_with(False)


class GuidanceSyncTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        base = Path(self.temp.name)
        self.bundle = base / ".local" / "publisher" / "codex-publication-preparation"
        self.bundle.mkdir(parents=True)
        self.etag = self.bundle / ".remote-etag"
        for key, value in (("BUNDLE_DIR", self.bundle), ("ETAG", self.etag)):
            p = patch.object(notes, key, value)
            p.start()
            self.addCleanup(p.stop)

    def write_content(self):
        for name in notes.FILES:
            (self.bundle / name).write_text(f"# {name}\n", encoding="utf-8")

    @staticmethod
    def write_zip(path, names=notes.FILES):
        with zipfile.ZipFile(path, "w", compression=zipfile.ZIP_DEFLATED) as archive:
            for name in names:
                archive.writestr(name, f"# {name}\n")

    def test_initial_push_is_create_only(self):
        self.write_content()
        with patch.object(notes, "aws", return_value={"ETag": '"r1"', "VersionId": "1"}) as aws:
            notes.push()
        self.assertIn("--if-none-match", aws.call_args.args)
        self.assertIn("application/zip", aws.call_args.args)
        self.assertEqual('"r1"', self.etag.read_text(encoding="utf-8"))

    def test_upload_contains_all_seven_guidance_files(self):
        self.write_content()

        def inspect(*args):
            archive_path = Path(args[args.index("--body") + 1])
            with zipfile.ZipFile(archive_path) as archive:
                self.assertEqual(set(notes.FILES), set(archive.namelist()))
                self.assertEqual(len(notes.FILES), 7)
            return {"ETag": '"r1"'}

        with patch.object(notes, "aws", side_effect=inspect):
            notes.push()

    def test_next_push_is_conditional(self):
        self.write_content()
        self.etag.write_text('"r1"', encoding="utf-8")
        with patch.object(notes, "aws", return_value={"ETag": '"r2"'}) as aws:
            notes.push()
        self.assertIn("--if-match", aws.call_args.args)
        self.assertIn('"r1"', aws.call_args.args)
        self.assertEqual('"r2"', self.etag.read_text(encoding="utf-8"))

    def test_push_requires_all_seven_files(self):
        self.write_content()
        (self.bundle / notes.FILES[1]).unlink()
        with self.assertRaisesRegex(RuntimeError, "Missing guidance file"):
            notes.push()

    def test_pull_protects_local_bundle(self):
        self.write_content()
        with self.assertRaisesRegex(RuntimeError, "already exists"):
            notes.pull()

    def test_pull_force_replaces_bundle(self):
        self.write_content()
        (self.bundle / "old-local-only.txt").write_text("local", encoding="utf-8")
        def download(*args):
            self.write_zip(Path(args[-1]))
            return {"ETag": '"remote"'}
        with patch.object(notes, "aws", side_effect=download):
            notes.pull(force=True)
        self.assertFalse((self.bundle / "old-local-only.txt").exists())
        self.assertEqual('"remote"', self.etag.read_text(encoding="utf-8"))
        self.assertEqual("# codex-instructions.md\n", (self.bundle / notes.FILES[0]).read_text(encoding="utf-8"))

    def test_pull_rejects_zip_extra_path_without_replacing_local(self):
        self.write_content()
        original = (self.bundle / notes.FILES[0]).read_text(encoding="utf-8")
        def download(*args):
            self.write_zip(Path(args[-1]), list(notes.FILES) + ["../../outside.md"])
            return {"ETag": '"bad"'}
        with patch.object(notes, "aws", side_effect=download):
            with self.assertRaisesRegex(RuntimeError, "seven expected"):
                notes.pull(force=True)
        self.assertEqual(original, (self.bundle / notes.FILES[0]).read_text(encoding="utf-8"))

    def test_identity_must_be_operator(self):
        with patch.object(notes, "aws", return_value={"Arn": "arn:aws:iam::905418096305:user/administrator"}):
            with self.assertRaisesRegex(RuntimeError, "aggregator-admin"):
                notes.authorize()


if __name__ == "__main__":
    unittest.main()
