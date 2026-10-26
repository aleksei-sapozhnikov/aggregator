"""Finalize a release after its version-boundary pull request is merged.

The runner calls this finalizer only after a merge step marked
``version_boundary``. It verifies the tag and commit, prepares release notes,
creates or verifies the GitHub release, and closes the milestone. Ordinary PR
open and merge events do not call it.
"""
from __future__ import annotations

import base64
from pathlib import Path

from . import milestones


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
    section = generated[generated.index("## What's Changed"):].strip()
    if section.count("## What's Changed") != 1 or section.count("**Full Changelog**") != 1:
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
    if not previous or previous.get("draft") or previous.get("prerelease") or not _tag_sha(client, release["previous_tag"]):
        raise RuntimeError("previous published release/tag missing")
    current_tag_sha = _tag_sha(client, tag)
    if current_tag_sha and current_tag_sha != sha:
        raise RuntimeError(f"existing {tag} points to conflicting SHA")
    if not current_tag_sha:
        client.post("/git/refs", {"ref": "refs/tags/" + tag, "sha": sha})
    progress["releases"].setdefault(tag, {"sha": sha, "tag_created": True,
                                             "published": False, "milestone_closed": False})
    save(progress)
    existing = client.release_by_tag(tag)
    narrative = release.get("notes")
    if narrative is None:
        narrative = (root / release["notes_file"]).read_text(encoding="utf-8")
    if existing:
        if (existing.get("draft") or existing.get("prerelease") or _tag_sha(client, tag) != sha
                or existing.get("name") != release["title"]
                or not existing.get("body", "").startswith(narrative.strip())
                or "## What's Changed" not in existing.get("body", "")):
            raise RuntimeError(f"existing {tag} release conflicts with expected published release")
        published = existing
    else:
        generated = client.post("/releases/generate-notes", {"tag_name": tag,
                "previous_tag_name": release["previous_tag"], "target_commitish": sha})
        body = combine(narrative, generated["body"])
        published = client.post("/releases", {"tag_name": tag, "target_commitish": sha,
            "name": release["title"], "body": body, "draft": False, "prerelease": False,
            "generate_release_notes": False})
    progress["releases"][tag] = {"sha": sha, "url": published["html_url"], "tag_created": True,
                                   "published": True,
                                   "milestone_closed": False}
    save(progress)
    milestone = milestones.matching(client, tag)
    if not milestone:
        raise RuntimeError(f"{tag} milestone missing during finalization")
    closed = milestones.close(client, milestone)
    if closed["state"] != "closed":
        raise RuntimeError(f"{tag} milestone closure unconfirmed")
    progress["releases"][tag]["milestone_closed"] = True
    save(progress)
    return progress["releases"][tag]
