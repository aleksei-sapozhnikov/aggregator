"""Publish GitHub releases and retain compatibility with legacy version boundaries."""

from __future__ import annotations

import base64
from pathlib import Path

from . import milestones
from .github_client import GitHubError


def _tag_sha(client, tag: str):
    ref = client.tag_ref(tag)
    if not ref:
        return None
    obj = ref["object"]
    if obj["type"] == "tag":
        obj = client.get("/git/tags/" + obj["sha"])["object"]
    if obj["type"] != "commit":
        raise RuntimeError(f"{tag} does not point to a commit")
    return obj["sha"]


def combine(narrative: str, generated: str) -> str:
    if "## What's Changed" not in generated or "**Full Changelog**" not in generated:
        raise RuntimeError("GitHub generated notes missing required sections")
    if narrative.count("## What's Changed") or narrative.count("**Full Changelog**"):
        raise RuntimeError("narrative duplicates GitHub generated sections")
    section = generated[generated.index("## What's Changed") :].strip()
    if (
        section.count("## What's Changed") != 1
        or section.count("**Full Changelog**") != 1
    ):
        raise RuntimeError("GitHub generated notes layout unexpected")
    return narrative.strip() + "\n\n" + section + "\n"


def finalize(client, release: dict, queue: dict, progress: dict, root: Path, *, save):
    tag = release["tag"]
    version_id = release["version_queue_id"]
    for row_id in release["queue_ids"]:
        pr_record = progress["prs"].get(str(row_id), {})
        if not pr_record.get("merge_sha"):
            raise RuntimeError(f"cannot release {tag} before all group PRs merge")
    sha = progress["prs"][str(version_id)]["merge_sha"]
    compare = client.compare(sha, "main")
    if compare["status"] not in ("identical", "ahead"):
        raise RuntimeError("version merge SHA is not an ancestor of main")
    env = client.get(f"/contents/.env?ref={sha}")
    text = base64.b64decode(env["content"]).decode()
    expected = "PROJECT_VERSION=" + tag.removeprefix("v")
    if expected not in [line.strip() for line in text.splitlines()]:
        raise RuntimeError(f".env at version merge SHA lacks {expected}")
    previous = client.release_by_tag(release["previous_tag"])
    if (
        not previous
        or previous.get("draft")
        or previous.get("prerelease")
        or not _tag_sha(client, release["previous_tag"])
    ):
        raise RuntimeError("previous published release/tag missing")
    current_tag_sha = _tag_sha(client, tag)
    if current_tag_sha and current_tag_sha != sha:
        raise RuntimeError(f"existing {tag} points to conflicting SHA")
    if not current_tag_sha:
        client.post("/git/refs", {"ref": "refs/tags/" + tag, "sha": sha})
    progress.setdefault("releases", {}).setdefault(
        tag,
        {
            "sha": sha,
            "tag_created": True,
            "published": False,
            "milestone_closed": False,
        },
    )
    save(progress)
    existing = client.release_by_tag(tag)
    narrative = release.get("notes")
    if narrative is None:
        narrative = (root / release["notes_file"]).read_text(encoding="utf-8")
    if existing:
        if (
            existing.get("draft")
            or existing.get("prerelease")
            or _tag_sha(client, tag) != sha
            or existing.get("name") != release["title"]
            or not existing.get("body", "").startswith(narrative.strip())
            or "## What's Changed" not in existing.get("body", "")
        ):
            raise RuntimeError(
                f"existing {tag} release conflicts with expected published release"
            )
        published = existing
    else:
        generated = client.post(
            "/releases/generate-notes",
            {
                "tag_name": tag,
                "previous_tag_name": release["previous_tag"],
                "target_commitish": sha,
            },
        )
        body = combine(narrative, generated["body"])
        published = client.post(
            "/releases",
            {
                "tag_name": tag,
                "target_commitish": sha,
                "name": release["title"],
                "body": body,
                "draft": False,
                "prerelease": False,
                "generate_release_notes": False,
            },
        )
    progress["releases"][tag] = {
        "sha": sha,
        "url": published["html_url"],
        "tag_created": True,
        "published": True,
        "milestone_closed": False,
    }
    save(progress)
    # Closing a milestone is optional project administration, not a release
    # publication gate. The release/tag are already durable in GitHub.
    try:
        milestone = milestones.matching(client, tag)
        if milestone:
            closed = milestones.close(client, milestone)
            if closed["state"] == "closed":
                progress["releases"][tag]["milestone_closed"] = True
                save(progress)
            else:
                print(f"Release {tag} milestone closure was not confirmed")
        else:
            print(f"Release {tag} milestone is missing; publication continues")
    except Exception as error:
        print(
            f"Release {tag} milestone closure warning: {type(error).__name__}"
        )
    return progress["releases"][tag]


def publish(client, release: dict, progress: dict, *, save) -> dict:
    """Publish an explicit release operation without inspecting the PR queue.

    The selected main commit is saved before any GitHub mutation. An
    interrupted invocation therefore retries the same target, even when
    main advances in the meantime.
    """
    tag = release["tag"]
    narrative = release["notes"].strip()
    records = progress.setdefault("releases", {})
    record = records.get(tag) or {}
    persisted_sha = record.get("sha")
    existing_tag_sha = _tag_sha(client, tag)
    existing = client.release_by_tag(tag)

    if persisted_sha:
        sha = persisted_sha
        if existing_tag_sha and existing_tag_sha != sha:
            raise RuntimeError(f"existing tag {tag} conflicts with saved release target")
    else:
        current_main = client.branch("main")["commit"]["sha"]
        if existing_tag_sha and existing_tag_sha != current_main and not existing:
            raise RuntimeError(
                f"existing tag {tag} differs from main without a saved release target"
            )
        sha = existing_tag_sha or current_main
        record = {
            "sha": sha,
            "tag_created": bool(existing_tag_sha),
            "published": False,
        }
        records[tag] = record
        save(progress)

    if not existing_tag_sha:
        try:
            client.post("/git/refs", {"ref": "refs/tags/" + tag, "sha": sha})
        except GitHubError as error:
            # A timed-out write may already have created the tag.
            if error.status != 422 or _tag_sha(client, tag) != sha:
                raise
        record["tag_created"] = True
        save(progress)

    if existing:
        if (
            existing.get("draft")
            or existing.get("prerelease")
            or existing.get("name") != release["title"]
            or not existing.get("body", "").startswith(narrative + "\n\n")
            or "## What's Changed" not in existing.get("body", "")
            or "**Full Changelog**" not in existing.get("body", "")
        ):
            raise RuntimeError(f"existing release {tag} conflicts with planned content")
        published = existing
    else:
        payload = {"tag_name": tag, "target_commitish": sha}
        if release.get("previous_tag"):
            payload["previous_tag_name"] = release["previous_tag"]
        generated = client.post("/releases/generate-notes", payload)
        body = combine(narrative, generated["body"])
        published = client.post(
            "/releases",
            {
                "tag_name": tag,
                "target_commitish": sha,
                "name": release["title"],
                "body": body,
                "draft": False,
                "prerelease": False,
                "generate_release_notes": False,
            },
        )
    records[tag] = {
        "sha": sha,
        "url": published["html_url"],
        "tag_created": True,
        "published": True,
    }
    save(progress)
    return records[tag]
