"""Assign immutable GHCR tags from each demo service's Git build-context tree."""

import argparse
import json
import os
import re
import subprocess
import sys
from pathlib import Path

SERVICES = {
    "aggregator": "services/aggregator",
    "aggregator-ui": "services/aggregator-ui",
    "catalog": "services/catalog",
    "ai-agent": "services/ai-agent",
    "chaos-maker": "services/chaos-maker",
    "dummy-java": "services/dummy-java",
    "dummy-python": "services/dummy-python",
    "dummy-javascript": "services/dummy-javascript",
}


def build_images(revision: str) -> list[dict[str, str]]:
    """The Git tree ID includes Dockerfiles, dependency files and all context inputs."""
    if not re.fullmatch(r"(?:HEAD|[0-9a-f]{40})", revision):
        raise ValueError("Revision must be HEAD or a full commit SHA")
    images = []
    for service, context in SERVICES.items():
        tag = subprocess.check_output(
            ["git", "rev-parse", "--verify", f"{revision}:{context}"], text=True
        ).strip()
        if not re.fullmatch(r"[0-9a-f]{40}", tag):
            raise ValueError(f"Invalid Git tree ID for {service}: {tag}")
        images.append({"service": service, "context": context, "tag": tag})
    return images


def compose_exports(images: list[dict[str, str]]) -> str:
    return "\n".join(
        f"export IMAGE_TAG_{image['service'].upper().replace('-', '_')}={image['tag']}"
        for image in images
    )


def update_kustomization(content: str, images: list[dict[str, str]]) -> str:
    expected = {image["service"]: image["tag"] for image in images}
    matched = set()
    pattern = re.compile(
        r"(?m)^(\s*- name: ghcr\.io/aleksei-sapozhnikov/([a-z-]+)\s*\n\s+newTag: )([^\s]+)\s*$"
    )

    def replace(match: re.Match[str]) -> str:
        service = match.group(2)
        if service not in expected or service in matched:
            raise ValueError(f"Unexpected or duplicate Kustomize image: {service}")
        matched.add(service)
        return match.group(1) + expected[service]

    result = pattern.sub(replace, content)
    if matched != expected.keys():
        raise ValueError(
            f"Expected image entries {sorted(expected)}, found {sorted(matched)}"
        )
    return result


def plan_missing(images: list[dict[str, str]], owner: str) -> list[dict[str, str]]:
    """Only missing published images need a GitHub Actions build matrix entry."""
    if not re.fullmatch(r"[A-Za-z0-9-]+", owner):
        raise ValueError("Invalid GHCR owner")
    missing = []
    for image in images:
        ref = f"ghcr.io/{owner.lower()}/{image['service']}:{image['tag']}"
        inspection = subprocess.run(
            ["docker", "buildx", "imagetools", "inspect", ref],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.PIPE,
            text=True,
            check=False,
        )
        if inspection.returncode:
            print(f"BUILD {ref} (image not found or inaccessible)", file=sys.stderr)
            missing.append(image)
        else:
            print(f"REUSE {ref}", file=sys.stderr)
    return missing


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "command", choices=["plan", "compose-env", "update-kustomization", "list"]
    )
    parser.add_argument("--revision", default="HEAD")
    parser.add_argument("--manifest", type=Path)
    args = parser.parse_args()
    images = build_images(args.revision)
    if args.command == "list":
        print(json.dumps(images))
    elif args.command == "compose-env":
        print(compose_exports(images))
    elif args.command == "update-kustomization":
        if not args.manifest:
            parser.error("--manifest is required")
        content = args.manifest.read_text(encoding="utf-8")
        args.manifest.write_text(
            update_kustomization(content, images), encoding="utf-8"
        )
    else:
        missing = plan_missing(images, os.environ["GITHUB_REPOSITORY_OWNER"])
        matrix = json.dumps({"include": missing}, separators=(",", ":"))
        output = os.environ["GITHUB_OUTPUT"]
        with open(output, "a", encoding="utf-8") as handle:
            handle.write(f"matrix={matrix}\n")
            handle.write(f"has_changes={str(bool(missing)).lower()}\n")
        summary = os.environ.get("GITHUB_STEP_SUMMARY")
        if summary:
            with open(summary, "a", encoding="utf-8") as handle:
                handle.write(
                    f"Published images reused: {len(images) - len(missing)} / {len(images)}.\n\n"
                )
                handle.write(f"Images to build and push: {len(missing)}.\n")


if __name__ == "__main__":
    main()
