"""Tests for deterministic per-service demo image tag generation."""

import os
import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from src.python.image_tags import (
    SERVICES,
    build_images,
    compose_exports,
    plan_missing,
    update_kustomization,
)


class ImageTagsTests(unittest.TestCase):
    def test_git_tree_tags_only_change_for_modified_context(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            subprocess.run(["git", "init", "-q", directory], check=True)
            subprocess.run(
                ["git", "-C", directory, "config", "user.email", "test@example.com"],
                check=True,
            )
            subprocess.run(
                ["git", "-C", directory, "config", "user.name", "Test"], check=True
            )
            for context in SERVICES.values():
                file = root / context / "Dockerfile"
                file.parent.mkdir(parents=True)
                file.write_text("FROM scratch\n", encoding="utf-8")
            subprocess.run(["git", "-C", directory, "add", "."], check=True)
            subprocess.run(
                ["git", "-C", directory, "commit", "-qm", "Initial"], check=True
            )
            previous = Path.cwd()
            try:
                os.chdir(root)
                before = build_images("HEAD")
                (root / "services/aggregator/Dockerfile").write_text(
                    "FROM alpine:3\n", encoding="utf-8"
                )
                subprocess.run(["git", "add", "."], check=True)
                subprocess.run(["git", "commit", "-qm", "Change one image"], check=True)
                after = build_images("HEAD")
            finally:
                os.chdir(previous)

            changed = [
                first["service"]
                for first, second in zip(before, after)
                if first["tag"] != second["tag"]
            ]
            self.assertEqual(changed, ["aggregator"])

    def test_kustomization_updates_exactly_eight_image_tags(self):
        images = [
            {"service": service, "context": context, "tag": "a" * 40}
            for service, context in SERVICES.items()
        ]
        original = "images:\n" + "".join(
            f"  - name: ghcr.io/aleksei-sapozhnikov/{service}\n"
            "    newTag: unpublished\n"
            for service in SERVICES
        )
        updated = update_kustomization(original, images)
        self.assertEqual(updated.count("newTag: " + "a" * 40), 8)
        invalid = original.replace(
            "  - name: ghcr.io/aleksei-sapozhnikov/dummy-java\n"
            "    newTag: unpublished\n",
            "",
        )
        with self.assertRaises(ValueError):
            update_kustomization(invalid, images)

    def test_compose_exports_use_distinct_service_variables(self):
        images = [{"service": "ai-agent", "context": "x", "tag": "a" * 40}]
        self.assertEqual(
            compose_exports(images), "export IMAGE_TAG_AI_AGENT=" + "a" * 40
        )

    def test_compose_image_tag_contract_matches_service_mapping(self):
        root = Path(__file__).resolve().parents[4]
        compose = (root / "deploy/compose/compose.images.demo.yaml").read_text(
            encoding="utf-8"
        )
        for service in SERVICES:
            variable = "IMAGE_TAG_" + service.upper().replace("-", "_")
            expected = (
                f"image: ghcr.io/aleksei-sapozhnikov/{service}:"
                + "${"
                + f"{variable}:?Missing {variable}"
                + "}"
            )
            self.assertIn(expected, compose)

    def test_real_kustomization_contains_all_expected_images(self):
        root = Path(__file__).resolve().parents[4]
        manifest = (root / "deploy/kubernetes/kustomization.yaml").read_text(
            encoding="utf-8"
        )
        images = [
            {"service": service, "context": context, "tag": "a" * 40}
            for service, context in SERVICES.items()
        ]
        updated = update_kustomization(manifest, images)
        self.assertEqual(updated.count("newTag: " + "a" * 40), 8)
        self.assertNotIn("newTag: unpublished", updated)

    def test_plan_only_builds_missing_images(self):
        images = [
            {"service": "aggregator", "tag": "a" * 40},
            {"service": "catalog", "tag": "b" * 40},
        ]

        def inspect(command, **kwargs):
            class Result:
                returncode = 0 if "aggregator:" in command[-1] else 1

            return Result()

        with patch("src.python.image_tags.subprocess.run", side_effect=inspect):
            missing = plan_missing(images, "ExampleOwner")
        self.assertEqual([image["service"] for image in missing], ["catalog"])


if __name__ == "__main__":
    unittest.main()
