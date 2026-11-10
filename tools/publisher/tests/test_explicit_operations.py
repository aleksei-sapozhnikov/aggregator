"""Exercise the explicit PR / release queue without legacy version heuristics."""

import json
import sys
import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path
from unittest.mock import MagicMock, patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "runtime" / "src"))

from html_calendar import render
from lambda_publisher.github import releases
from lambda_publisher.publication.snapshot_runner import Runner
from plan import compile_plan
from publisher import _validate_history


def sample_operations():
    return {
        "timezone": "Europe/Belgrade",
        "start_date": "2027-11-26",
        "end_date": "2027-11-27",
        "operations": [
            {
                "type": "pr", "branch": "version/v0.8.5",
                "title": "Ordinary PR with a version-shaped branch name",
                "body": "- Update version.\n\n## Result\n- Version is updated.",
                "open": "2027-11-26 09:00",
                "merge": "2027-11-26 10:30",
            },
            {
                "type": "release", "tag": "v0.8.5",
                "title": "HTTPS ingress and reversible K3s cutover",
                "notes": "## Features\n- HTTPS ingress",
                "publish": "2027-11-26 11:00",
            },
            {
                "type": "pr", "branch": "hotfix-after-release",
                "title": "Follow-up fix",
                "body": "- Repair configuration.\n\n## Result\n- Deploy restored.",
                "open": "2027-11-26 12:00",
                "merge": "2027-11-26 13:30",
            },
            {
                "type": "release", "tag": "v0.8.6",
                "title": "Follow-up release",
                "notes": "## Fixes\n- Deploy restored",
                "publish": "2027-11-27 09:00",
                "previous_tag": "v0.8.5",
            },
        ],
    }


class ExplicitOperationsPlanTests(unittest.TestCase):
    def compile(self, plan):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "plan.json"
            path.write_text(json.dumps(plan), encoding="utf-8")
            return compile_plan(path)

    def test_release_is_an_explicit_operation(self):
        snapshot = self.compile(sample_operations())
        self.assertEqual(2, snapshot["format"])
        self.assertEqual(2, len(snapshot["queue"]["entries"]))
        self.assertEqual(
            ["open_pr", "merge_pr", "publish_release",
             "open_pr", "merge_pr", "publish_release"],
            [event["action"] for event in snapshot["schedule"]["events"]],
        )
        self.assertFalse(snapshot["queue"]["entries"][0].get("version_boundary", False))
        self.assertNotIn("previous_published_tag", snapshot["config"])
        self.assertNotIn("release_titles", snapshot["config"])
        self.assertIsNone(snapshot["releases"]["releases"][0]["previous_tag"])
        self.assertEqual(
            "v0.8.5", snapshot["releases"]["releases"][1]["previous_tag"]
        )

    def test_release_only_plan_is_valid(self):
        plan = sample_operations()
        plan["operations"] = [plan["operations"][1]]
        snapshot = self.compile(plan)
        self.assertEqual([], snapshot["queue"]["entries"])
        self.assertEqual("publish_release", snapshot["schedule"]["events"][0]["action"])

    def test_reject_overlapping_operation_times(self):
        plan = sample_operations()
        plan["operations"][1]["publish"] = "2027-11-26 10:30"
        with self.assertRaisesRegex(ValueError, "times must increase"):
            self.compile(plan)

    def test_reject_unknown_operation_fields(self):
        plan = sample_operations()
        plan["operations"][1]["previous_published_tag"] = "v0.8.4"
        with self.assertRaisesRegex(ValueError, "invalid release operation"):
            self.compile(plan)

    def test_markdown_files_are_resolved_on_plan_compilation(self):
        plan = sample_operations()
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            (root / "bodies").mkdir()
            (root / "releases").mkdir()
            (root / "bodies" / "first.md").write_text(
                "- File-backed PR.\n\n## Result\n- Done.\n", encoding="utf-8"
            )
            (root / "releases" / "v0.8.5.md").write_text(
                "## Features\n- From Markdown\n", encoding="utf-8"
            )
            plan["operations"][0].pop("body")
            plan["operations"][0]["body_file"] = "bodies/first.md"
            plan["operations"][1].pop("notes")
            plan["operations"][1]["notes_file"] = "releases/v0.8.5.md"
            path = root / "plan.json"
            path.write_text(json.dumps(plan), encoding="utf-8")
            snapshot = compile_plan(path)
        self.assertIn("File-backed PR", snapshot["queue"]["entries"][0]["body"])
        self.assertIn("From Markdown", snapshot["releases"]["releases"][0]["notes"])

    def test_calendar_renders_releases_after_preceding_pr(self):
        snapshot = self.compile(sample_operations())
        progress = {
            "completed": ["publisher-001-open", "publisher-001-merge",
                          "publisher-002-publish"],
            "prs": {"1": {"number": 351}},
            "releases": {"v0.8.5": {"url": "https://github.com/example/release"}},
        }
        html = render(
            snapshot, progress, paused=False,
            checked_at=datetime(2027, 11, 26, 14, tzinfo=timezone.utc),
        )
        self.assertIn("HTTPS ingress and reversible K3s cutover", html)
        self.assertIn("Published", html)
        self.assertLess(html.index("Ordinary PR with"), html.index("HTTPS ingress and reversible K3s cutover"))
        self.assertLess(html.index("Release HTTPS ingress"), html.index("Follow-up fix"))

    def test_completed_releases_cannot_be_rewritten(self):
        old = self.compile(sample_operations())
        plan = sample_operations()
        plan["operations"][1]["notes"] = "## Different notes\n- Changed"
        new = self.compile(plan)
        with self.assertRaisesRegex(RuntimeError, "started operation"):
            _validate_history(
                old, new,
                ["publisher-001-open", "publisher-001-merge", "publisher-002-publish"],
            )

    def test_legacy_and_explicit_snapshots_cannot_mutate_in_place(self):
        old = self.compile(sample_operations())
        other = dict(old, format=1)
        with self.assertRaisesRegex(RuntimeError, "snapshot format"):
            _validate_history(other, old, [])


class ExplicitReleaseRunnerTests(unittest.TestCase):
    def setup_runner(self):
        test = ExplicitOperationsPlanTests()
        snapshot = test.compile(sample_operations())
        progress = {
            "completed": ["publisher-001-open", "publisher-001-merge"],
            "prs": {"1": {"merge_sha": "a" * 40}},
            "releases": {},
        }
        state = MagicMock()
        state.acquire.return_value = {
            "activated": True,
            "paused": False,
            "activation_all": True,
            "progress": progress,
        }
        client = MagicMock()
        client.identity.return_value = {"login": snapshot["config"]["expected_actor"]}
        runner = Runner(
            snapshot["config"], snapshot["queue"], snapshot["schedule"],
            snapshot["releases"], client, MagicMock(), state,
        )
        return runner, state, client, progress

    def test_release_publishes_after_preceding_merges(self):
        runner, state, client, progress = self.setup_runner()
        sha = "e" * 40
        client.branch.return_value = {"commit": {"sha": sha}}
        client.tag_ref.return_value = None
        client.release_by_tag.return_value = None

        def post(endpoint, payload):
            if endpoint == "/releases/generate-notes":
                self.assertEqual(
                    {"tag_name": "v0.8.5", "target_commitish": sha},
                    payload,
                )
                return {
                    "body": "## What's Changed\n* PR #351\n\n**Full Changelog**: link"
                }
            if endpoint == "/releases":
                self.assertEqual(
                    "## Features\n- HTTPS ingress\n\n"
                    "## What's Changed\n* PR #351\n\n**Full Changelog**: link\n",
                    payload["body"],
                )
                return {"html_url": "https://github.com/example/releases/tag/v0.8.5"}
            if endpoint == "/git/refs":
                self.assertEqual(sha, payload["sha"])
                return {"ref": "refs/tags/v0.8.5"}
            self.fail(f"unexpected GitHub endpoint: {endpoint}")

        client.post.side_effect = post
        with patch.dict("os.environ", {"ACTIVATION_ENABLED": "true"}):
            result = runner.run(
                dry_run=False, reconcile=True,
                now=datetime(2027, 11, 26, 11, tzinfo=timezone.utc),
            )
        self.assertEqual("completed", result["status"])
        self.assertEqual("v0.8.5", result["tag"])
        self.assertIn("publisher-002-publish", progress["completed"])
        self.assertTrue(progress["releases"]["v0.8.5"]["published"])
        self.assertGreaterEqual(state.save.call_count, 3)

    def test_published_release_is_idempotent_when_main_advances(self):
        sha = "a" * 40
        client = MagicMock()
        client.tag_ref.return_value = {
            "object": {"type": "commit", "sha": sha}
        }
        client.release_by_tag.return_value = {
            "draft": False, "prerelease": False, "name": "Release title",
            "body": "## Intro\n\n## What's Changed\n- PR #3\n\n**Full Changelog**: link",
            "html_url": "https://github.com/example/releases/tag/v1.2.3",
        }
        progress = {"releases": {"v1.2.3": {"sha": sha, "published": False}}}
        outcome = releases.publish(
            client,
            {"tag": "v1.2.3", "title": "Release title", "notes": "## Intro"},
            progress,
            save=lambda _: None,
        )
        self.assertTrue(outcome["published"])
        client.branch.assert_not_called()
        client.post.assert_not_called()

    def test_previous_tag_is_used_only_when_explicit(self):
        client = MagicMock()
        client.branch.return_value = {"commit": {"sha": "a" * 40}}
        client.tag_ref.return_value = None
        client.release_by_tag.return_value = None
        posted = []

        def post(endpoint, payload):
            posted.append((endpoint, payload))
            if endpoint == "/releases/generate-notes":
                return {
                    "body": "## What's Changed\n* One\n\n**Full Changelog**: link"
                }
            if endpoint == "/releases":
                return {"html_url": "https://github.com/example/release"}
            return {}

        client.post.side_effect = post
        releases.publish(
            client,
            {
                "tag": "v1.2.4",
                "title": "Release title",
                "notes": "## Notes",
                "previous_tag": "v1.2.1",
            },
            {"releases": {}},
            save=lambda _: None,
        )
        generated = next(payload for endpoint, payload in posted
                         if endpoint == "/releases/generate-notes")
        self.assertEqual("v1.2.1", generated["previous_tag_name"])


if __name__ == "__main__":
    unittest.main()
