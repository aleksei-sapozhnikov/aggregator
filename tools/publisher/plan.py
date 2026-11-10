"""Compile a human-readable publication plan into the existing safe runtime format."""

from __future__ import annotations

import json
import re
from datetime import datetime, timedelta, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

REPOSITORY = "aleksei-sapozhnikov/aggregator"
PROJECT_URL = "https://github.com/users/aleksei-sapozhnikov/projects/1"
BRANCH = re.compile(r"[A-Za-z0-9][A-Za-z0-9._/-]{0,180}\Z")
TAG = re.compile(r"v\d+\.\d+\.\d+\Z")
RELEASE_TAG = re.compile(r"[A-Za-z0-9][A-Za-z0-9._/-]{0,180}\Z")


def _valid_release_tag(value) -> bool:
    return (
        isinstance(value, str)
        and bool(RELEASE_TAG.fullmatch(value))
        and ".." not in value
        and "//" not in value
        and not value.endswith(("/", ".", ".lock"))
    )



def _file(root: Path, name: str) -> str:
    if not isinstance(name, str) or not name or "\\" in name:
        raise ValueError("file path must be a relative filename")
    path = (root / name).resolve()
    if not path.is_relative_to(root.resolve()) or not path.is_file():
        raise ValueError(f"file is missing or outside the plan directory: {name}")
    return path.read_text(encoding="utf-8-sig").replace("\r\n", "\n").strip()


def _time(raw: str, tz: ZoneInfo) -> datetime:
    if not isinstance(raw, str) or not re.fullmatch(r"\d{4}-\d\d-\d\d \d\d:\d\d", raw):
        raise ValueError("time must use YYYY-MM-DD HH:MM")
    value = datetime.strptime(raw, "%Y-%m-%d %H:%M")
    first = value.replace(tzinfo=tz, fold=0)
    second = value.replace(tzinfo=tz, fold=1)
    if first.utcoffset() != second.utcoffset():
        raise ValueError(f"ambiguous or nonexistent local time: {raw}")
    if first.astimezone(timezone.utc).astimezone(tz).replace(tzinfo=None) != value:
        raise ValueError(f"nonexistent local time: {raw}")
    return first


def _content(root: Path, item: dict, field: str) -> str:
    inline, filename = field, field + "_file"
    if (inline in item) == (filename in item):
        raise ValueError(f"specify exactly one of {inline} or {filename}")
    value = item[inline] if inline in item else _file(root, item[filename])
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f"empty {field}")
    return value.strip()


def compile_plan(path: Path) -> dict:
    """Build an immutable snapshot without reading or changing AWS."""
    path = Path(path).resolve()
    plan = json.loads(path.read_text(encoding="utf-8-sig"))
    if "operations" in plan:
        return compile_operations(path, plan)
    if not isinstance(plan, dict) or set(plan) != {
        "timezone", "previous_published_tag", "start_date", "end_date",
        "pull_requests", "releases",
    }:
        raise ValueError("plan must contain timezone, previous_published_tag, start_date, end_date, pull_requests, releases")
    if plan["timezone"] != "Europe/Belgrade":
        raise ValueError("publisher timezone must be Europe/Belgrade")
    tz = ZoneInfo(plan["timezone"])
    start, end = plan["start_date"], plan["end_date"]
    if not isinstance(start, str) or not isinstance(end, str) or not re.fullmatch(r"\d{4}-\d{2}-\d{2}", start) or not re.fullmatch(r"\d{4}-\d{2}-\d{2}", end):
        raise ValueError("start_date and end_date must be YYYY-MM-DD")
    if end < start:
        raise ValueError("end_date must not precede start_date")
    if not TAG.fullmatch(plan["previous_published_tag"]):
        raise ValueError("previous_published_tag must be a semver tag")
    if not isinstance(plan["pull_requests"], list) or not isinstance(plan["releases"], dict):
        raise ValueError("pull_requests must be an array and releases must be an object")
    config = {
        "repository": REPOSITORY, "base": "main", "timezone": plan["timezone"],
        "start_date": start, "end_date": end,
        "start_window": {"from": "09:00", "through": "20:30", "inclusive": True},
        "execution_window": {"from": "09:00", "through": "22:00", "inclusive": True},
        "allowed_merge_method": "squash", "maximum_open_prs_from_queue": 1,
        "minimum_actual_open_minutes": 60, "minimum_planned_open_minutes": 75,
        "post_release_open_minutes": 40,
        "final_version_merge_latest_local": "18:30", "event_prefix": "publisher",
        "expected_actor": "aleksei-sapozhnikov",
        "project": {"kind": "user_project_v2", "number": 1, "owner": "aleksei-sapozhnikov", "url": PROJECT_URL},
        "previous_published_tag": plan["previous_published_tag"],
        "release_titles": {},
    }
    entries, events, tags, seen_branches = [], [], [], set()
    last_utc = None
    last_merge = None
    last_release = None
    for position, row in enumerate(plan["pull_requests"], 1):
        if not isinstance(row, dict) or not {"branch", "release", "title", "open", "merge"}.issubset(row) or set(row) - {
            "id", "branch", "release", "title", "body", "body_file", "outcome", "expected_source_commits", "open", "merge"
        }:
            raise ValueError(f"invalid fields in pull request {position}")
        index = row.get("id", position)
        if type(index) is not int or index <= 0 or (entries and index <= entries[-1]["id"]):
            raise ValueError("PR queue IDs must be unique, positive, and increasing")
        branch, release = row["branch"], row["release"]
        if not isinstance(branch, str) or not BRANCH.fullmatch(branch) or ".." in branch or branch.endswith("/") or branch in seen_branches:
            raise ValueError(f"invalid or duplicate branch: {branch}")
        if not isinstance(release, str) or not TAG.fullmatch(release):
            raise ValueError(f"invalid release for PR {index}")
        if release != last_release:
            if release in tags:
                raise ValueError("release PRs must be contiguous")
            tags.append(release)
            last_release = release
        title = row["title"]
        if not isinstance(title, str) or not title.strip():
            raise ValueError(f"missing PR title for {index}")
        body = _content(path.parent, row, "body")
        if not body.startswith("- ") or "\n\n## Result\n- " not in body:
            raise ValueError(f"PR {index} body needs bullets and a ## Result section")
        count = row.get("expected_source_commits", 1)
        if type(count) is not int or count < 1:
            raise ValueError("expected_source_commits must be positive")
        opened, merged = _time(row["open"], tz), _time(row["merge"], tz)
        if opened.date().isoformat() < start or merged.date().isoformat() > end:
            raise ValueError(f"PR {index} outside plan date range")
        if not ("09:00" <= opened.strftime("%H:%M") <= "20:30" and "09:00" <= merged.strftime("%H:%M") <= "20:30"):
            raise ValueError(f"PR {index} outside 09:00-20:30")
        if merged - opened < timedelta(minutes=75):
            raise ValueError(f"PR {index} must remain open at least 75 minutes")
        if last_merge and opened <= last_merge + timedelta(minutes=15):
            raise ValueError(f"PR {index} must open at least 15 minutes after previous merge")
        if last_utc and opened.astimezone(timezone.utc) <= last_utc:
            raise ValueError("PR times must increase")
        last_utc, last_merge = merged.astimezone(timezone.utc), merged
        entry = {
            "id": index, "branch": branch,
            "depends_on": entries[-1]["branch"] if entries else "main",
            "release": release, "title": title.strip(), "body": body,
            "outcome": row.get("outcome", title.strip()),
            "expected_source_commits": count,
            "version_boundary": branch == f"version/{release}",
            "source_mode": "new", "existing_pr_number": None,
            "pr_file": f"plan/{index:03d}.json",
        }
        entries.append(entry)
        seen_branches.add(branch)
        for action, suffix, dt in (("open_pr", "open", opened), ("merge_pr", "merge", merged)):
            events.append({
                "id": f"{config['event_prefix']}-{index:03d}-{suffix}", "queue_id": index,
                "action": action, "branch": branch, "release": release,
                "local": dt.isoformat(timespec="seconds"),
                "utc": dt.astimezone(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z"),
            })
    releases = []
    prior = plan["previous_published_tag"]
    if set(plan["releases"]) != set(tags):
        raise ValueError("releases definitions must match release tags used by the queue")
    for tag in tags:
        if tuple(map(int, tag[1:].split("."))) <= tuple(map(int, prior[1:].split("."))):
            raise ValueError("release tags must increase from previous_published_tag")
        group = [e for e in entries if e["release"] == tag]
        if sum(e["version_boundary"] for e in group) != 1 or not group[-1]["version_boundary"]:
            raise ValueError(f"release {tag} must end with its version/{tag} PR")
        rd = plan["releases"][tag]
        if not isinstance(rd, dict) or not "title" in rd or set(rd) - {"title", "notes", "notes_file"}:
            raise ValueError(f"invalid release definition for {tag}")
        title = rd["title"]
        notes = _content(path.parent, rd, "notes")
        if not isinstance(title, str) or not title.strip() or "## What's Changed" in notes or "**Full Changelog**" in notes:
            raise ValueError(f"invalid release title or notes for {tag}")
        releases.append({
            "tag": tag, "previous_tag": prior, "title": title.strip(),
            "notes": notes, "milestone_semantic": tag,
            "version_queue_id": group[-1]["id"], "version_branch": group[-1]["branch"],
            "queue_ids": [e["id"] for e in group],
        })
        config["release_titles"][tag] = title.strip()
        prior = tag
    if events and entries[-1]["version_boundary"] is False:
        raise ValueError("last queued PR must be a version boundary")
    if events and last_merge.strftime("%H:%M") > config["final_version_merge_latest_local"]:
        raise ValueError("final release merge must complete by 18:30")
    from lambda_publisher.publication.config import queue_digest
    from lambda_publisher.publication.publication import validate_snapshot
    queue = {"repository": REPOSITORY, "entries": entries}
    snapshot = {
        "format": 1, "config": config, "queue": queue,
        "schedule": {"timezone": plan["timezone"], "start": start, "end": end,
                     "events": events, "queue_sha256": queue_digest(queue)},
        "releases": {"releases": releases},
    }
    validate_snapshot(snapshot)
    return snapshot


def compile_operations(path: Path, plan: dict) -> dict:
    """Compile an explicit ordered queue of PR and release operations."""
    if set(plan) != {"timezone", "start_date", "end_date", "operations"}:
        raise ValueError(
            "operation plan requires timezone, start_date, end_date, and operations"
        )
    if plan["timezone"] != "Europe/Belgrade":
        raise ValueError("publisher timezone must be Europe/Belgrade")
    start, end = plan["start_date"], plan["end_date"]
    if any(
        not isinstance(value, str)
        or not re.fullmatch(r"\d{4}-\d{2}-\d{2}", value)
        for value in (start, end)
    ):
        raise ValueError("start_date and end_date must use YYYY-MM-DD")
    if end < start:
        raise ValueError("end_date must not precede start_date")
    if not isinstance(plan["operations"], list) or not plan["operations"]:
        raise ValueError("operations must be a non-empty array")

    tz = ZoneInfo(plan["timezone"])
    config = {
        "repository": REPOSITORY,
        "base": "main",
        "timezone": plan["timezone"],
        "start_date": start,
        "end_date": end,
        "start_window": {"from": "09:00", "through": "20:30", "inclusive": True},
        "execution_window": {"from": "09:00", "through": "22:00", "inclusive": True},
        "allowed_merge_method": "squash",
        "maximum_open_prs_from_queue": 1,
        "minimum_actual_open_minutes": 60,
        "minimum_planned_open_minutes": 75,
        "event_prefix": "publisher",
        "expected_actor": "aleksei-sapozhnikov",
        "project": {
            "kind": "user_project_v2",
            "number": 1,
            "owner": "aleksei-sapozhnikov",
            "url": PROJECT_URL,
        },
    }
    entries, releases, events = [], [], []
    used_ids, used_branches, used_tags = set(), set(), set()
    last_id, last_utc, last_merge = 0, None, None

    def add_event(index: int, action: str, timestamp: datetime, *, branch: str, tag: str | None):
        nonlocal last_utc
        utc = timestamp.astimezone(timezone.utc)
        if not start <= timestamp.date().isoformat() <= end:
            raise ValueError(f"operation {index} outside plan dates")
        if not "09:00" <= timestamp.strftime("%H:%M") <= "20:30":
            raise ValueError(f"operation {index} outside 09:00-20:30")
        if last_utc is not None and utc <= last_utc:
            raise ValueError("operation times must increase in queue order")
        last_utc = utc
        suffix = {"open_pr": "open", "merge_pr": "merge", "publish_release": "publish"}[action]
        event = {
            "id": f"publisher-{index:03d}-{suffix}",
            "queue_id": index,
            "action": action,
            "branch": branch,
            "release": tag or "",
            "local": timestamp.isoformat(timespec="seconds"),
            "utc": utc.isoformat(timespec="seconds").replace("+00:00", "Z"),
        }
        events.append(event)

    for position, row in enumerate(plan["operations"], 1):
        if not isinstance(row, dict):
            raise ValueError(f"operation {position} must be an object")
        index = row.get("id", position)
        if type(index) is not int or index <= last_id:
            raise ValueError("operation IDs must be positive and increasing")
        last_id = index
        if index in used_ids:
            raise ValueError("operation IDs must be unique")
        used_ids.add(index)

        if row.get("type") in ("pull_request", "pr"):
            if (
                not {"type", "branch", "title", "open", "merge"}.issubset(row)
                or set(row) - {
                    "id", "type", "branch", "title", "body", "body_file",
                    "open", "merge", "milestone", "expected_source_commits",
                }
            ):
                raise ValueError(f"invalid PR operation {index}")
            branch, title = row["branch"], row["title"]
            if (
                not isinstance(branch, str)
                or not BRANCH.fullmatch(branch)
                or ".." in branch or branch.endswith("/")
                or branch in used_branches
            ):
                raise ValueError(f"invalid or duplicate PR branch: {branch}")
            if not isinstance(title, str) or not title.strip():
                raise ValueError(f"missing PR title for {index}")
            body = _content(path.parent, row, "body")
            if not body.startswith("- ") or "\n\n## Result\n- " not in body:
                raise ValueError(f"PR {index} needs bullets and a ## Result section")
            milestone = row.get("milestone")
            if milestone is not None and (
                not isinstance(milestone, str) or not TAG.fullmatch(milestone)
            ):
                raise ValueError(f"invalid optional PR milestone: {milestone}")
            count = row.get("expected_source_commits", 1)
            if type(count) is not int or count < 1:
                raise ValueError("expected_source_commits must be positive")
            opened, merged = _time(row["open"], tz), _time(row["merge"], tz)
            if merged - opened < timedelta(minutes=75):
                raise ValueError(f"PR {index} must be planned open for 75 minutes")
            if last_merge is not None and opened <= last_merge + timedelta(minutes=15):
                raise ValueError(f"PR {index} must open at least 15 minutes after previous merge")
            entry = {
                "id": index, "branch": branch, "title": title.strip(), "body": body,
                "milestone": milestone, "source_mode": "new",
                "expected_source_commits": count, "existing_pr_number": None,
            }
            entries.append(entry)
            used_branches.add(branch)
            add_event(index, "open_pr", opened, branch=branch, tag=None)
            add_event(index, "merge_pr", merged, branch=branch, tag=None)
            last_merge = merged
        elif row.get("type") == "release":
            if (
                not {"type", "tag", "title", "publish"}.issubset(row)
                or set(row) - {
                    "id", "type", "tag", "title", "publish", "notes", "notes_file",
                    "previous_tag",
                }
            ):
                raise ValueError(f"invalid release operation {index}")
            tag, title = row["tag"], row["title"]
            if not _valid_release_tag(tag) or tag in used_tags:
                raise ValueError(f"invalid or duplicate release tag: {tag}")
            if not isinstance(title, str) or not title.strip():
                raise ValueError(f"missing release title for {index}")
            notes = _content(path.parent, row, "notes")
            if "## What's Changed" in notes or "**Full Changelog**" in notes:
                raise ValueError("prepared release notes duplicate generated GitHub sections")
            previous = row.get("previous_tag")
            if previous is not None and (
                not isinstance(previous, str)
                or not _valid_release_tag(previous)
                or previous == tag
            ):
                raise ValueError(f"invalid optional previous_tag for {tag}")
            releases.append({
                "id": index, "tag": tag, "title": title.strip(),
                "notes": notes, "previous_tag": previous,
            })
            used_tags.add(tag)
            add_event(
                index, "publish_release", _time(row["publish"], tz),
                branch="main", tag=tag,
            )
        else:
            raise ValueError(f"unknown operation type at position {position}")

    from lambda_publisher.publication.config import queue_digest
    from lambda_publisher.publication.publication import validate_snapshot

    queue = {"repository": REPOSITORY, "entries": entries}
    snapshot = {
        "format": 2,
        "config": config,
        "queue": queue,
        "schedule": {
            "timezone": plan["timezone"],
            "start": start,
            "end": end,
            "events": events,
            "queue_sha256": queue_digest(queue),
        },
        "releases": {"releases": releases},
    }
    validate_snapshot(snapshot)
    return snapshot
