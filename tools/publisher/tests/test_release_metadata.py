"""Release publication must not depend on the optional milestone closure."""

import base64
import sys
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "runtime" / "src"))

from lambda_publisher.github import releases


class ReleaseMetadataTests(unittest.TestCase):
    def test_release_completes_when_milestone_is_unavailable(self):
        tag = "v0.8.0"
        commit = "e" * 40
        prior = "d" * 40
        client = MagicMock()
        client.compare.return_value = {"status": "identical"}
        client.get.return_value = {
            "content": base64.b64encode(b"PROJECT_VERSION=0.8.0\n").decode()
        }
        client.tag_ref.side_effect = lambda version: {
            "object": {
                "type": "commit",
                "sha": commit if version == tag else prior,
            },
        }
        client.release_by_tag.side_effect = lambda version: (
            {
                "name": "Release v0.8.0",
                "body": "## Features\n- Changes\n\n## What's Changed\n- One change\n\n**Full Changelog**",
                "draft": False,
                "prerelease": False,
                "html_url": "https://github.com/aleksei-sapozhnikov/aggregator/releases/tag/v0.8.0",
            }
            if version == tag
            else {"draft": False, "prerelease": False}
        )
        progress = {"prs": {"2": {"merge_sha": commit}}}
        stored = []
        release = {
            "tag": tag,
            "previous_tag": "v0.7.13",
            "version_queue_id": 2,
            "queue_ids": [2],
            "title": "Release v0.8.0",
            "notes": "## Features\n- Changes",
        }

        with patch.object(
            releases.milestones, "matching",
            side_effect=RuntimeError("milestone unavailable"),
        ):
            result = releases.finalize(
                client, release, {}, progress, Path("/not-used"),
                save=lambda updated: stored.append(updated["releases"][tag].copy()),
            )

        self.assertTrue(result["published"])
        self.assertFalse(result["milestone_closed"])
        self.assertGreaterEqual(len(stored), 1)
        client.post.assert_not_called()


if __name__ == "__main__":
    unittest.main()
