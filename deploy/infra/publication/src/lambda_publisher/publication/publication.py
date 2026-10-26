"""Compile publication inputs into an immutable queue snapshot.

Operator tools call the compiler when preparing or changing a publication plan,
before storing a new revision in S3. Lambda loads that snapshot by revision for
each event; validation checks queue contents, timing, dependencies, and release
definitions before execution.
"""
from __future__ import annotations

import hashlib
import json
import re
from collections import Counter
from datetime import datetime, timedelta, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

from .source_format import read_plan, read_pr, _local, _safe_pr_path, TAG
from .config import queue_digest


def canonical(value: dict) -> bytes:
    return (json.dumps(value, sort_keys=True, ensure_ascii=False, separators=(",", ":")) + "\n").encode("utf-8")


def digest(raw: bytes) -> str:
    return hashlib.sha256(raw).hexdigest()


def snapshot_key(revision: str) -> str:
    if not re.fullmatch(r"[0-9a-f]{64}", revision):
        raise ValueError("invalid snapshot revision")
    return f"snapshots/{revision}.json"


def load_snapshot(s3, bucket: str, revision: str) -> dict:
    raw = s3.get_object(Bucket=bucket, Key=snapshot_key(revision))["Body"].read()
    if digest(raw) != revision:
        raise RuntimeError("S3 publication snapshot digest mismatch")
    result = json.loads(raw)
    if result.get("format") != 1 or canonical(result) != raw:
        raise RuntimeError("S3 publication snapshot format mismatch")
    validate_snapshot(result)
    return result


def _release_definitions(config: dict, entries: list[dict], root: Path, previous: dict | None,
                         completed: list[str]) -> list[dict]:
    tags = list(dict.fromkeys(row["release"] for row in entries))
    titles = config.get("release_titles", {})
    if set(titles) != set(tags):
        raise ValueError("release_titles must cover each release once")
    result = []
    prior = config["previous_published_tag"]
    for tag in tags:
        if not TAG.fullmatch(tag) or not TAG.fullmatch(prior):
            raise ValueError("invalid release tag")
        group = [row for row in entries if row["release"] == tag]
        if len([row for row in group if row["version_boundary"]]) != 1 or not group[-1]["version_boundary"]:
            raise ValueError(f"release {tag} requires a final version PR")
        path = root / "releases" / f"{tag}.md"
        if path.is_file():
            notes = path.read_text(encoding="utf-8-sig").replace("\r\n", "\n")
        else:
            old = next((item for item in (previous or {}).get("releases", {}).get("releases", []) if item["tag"] == tag), None)
            merge_id = f"{config['event_prefix']}-{group[-1]['id']:03d}-merge"
            if not old or not old.get("notes") or merge_id not in completed:
                raise ValueError(f"release notes missing: {path}")
            notes = old["notes"]
        if not notes.strip() or "## What's Changed" in notes or "**Full Changelog**" in notes:
            raise ValueError(f"release notes empty or duplicate generated sections: {tag}")
        result.append({"tag": tag, "previous_tag": prior, "title": titles[tag], "notes": notes,
                       "milestone_semantic": tag, "version_queue_id": group[-1]["id"],
                       "version_branch": group[-1]["branch"], "queue_ids": [row["id"] for row in group]})
        prior = tag
    return result


def compile_sources(root: Path, *, previous: dict | None = None, completed: list[str] | None = None,
                    progress: dict | None = None) -> dict:
    root = root.resolve()
    config = json.loads((root / "config.yaml").read_text(encoding="utf-8-sig"))
    rows = read_plan(root / "publication-plan.csv")
    if not rows and not previous:
        raise ValueError("empty first publication plan requires durable prior history")
    tz = ZoneInfo(config["timezone"])
    window = config["start_window"]
    minimum = int(config["minimum_actual_open_minutes"])
    if config.get("allowed_merge_method") != "squash" or minimum < 60 or config.get("maximum_open_prs_from_queue") != 1:
        raise ValueError("publication safety policy is incomplete")
    planned_minimum = int(config.get("minimum_planned_open_minutes", 75))
    if planned_minimum < minimum:
        raise ValueError("planned PR age is below actual age policy")
    if not re.fullmatch(r"[a-z0-9][a-z0-9-]*", config.get("event_prefix", "")):
        raise ValueError("event_prefix must be stable lowercase Scheduler name text")
    entries, events, seen_branches, seen_files, seen_numbers = [], [], set(), set(), set()
    closed_releases = set()
    last_release = None
    seen_new = False
    seen_existing_open = False
    last_utc = None
    completed = completed or []
    completed_set = set(completed)
    if previous and any(event["id"] not in completed_set for event in
                        previous.get("history", {}).get("events", [])):
        raise ValueError("durable completed event disappeared from progress")
    previous_rows = {row["id"]: row for row in (previous or {}).get("queue", {}).get("entries", [])}
    active_ids = [int(row["id"]) for row in rows]
    if active_ids != sorted(set(active_ids)) or any(value <= 0 for value in active_ids):
        raise ValueError("active PR IDs must be unique, positive, and increasing")
    archived_ids = sorted(set(previous_rows) - set(active_ids))
    if archived_ids and active_ids and max(archived_ids) >= min(active_ids):
        raise ValueError("only a verified completed leading range may be archived")
    for archived_id in archived_ids:
        old = previous_rows[archived_id]
        merge_id = f"{config['event_prefix']}-{archived_id:03d}-merge"
        if old.get("source_mode") != "already_merged" and merge_id not in completed_set:
            raise ValueError(f"cannot remove unfinished PR {archived_id} from active plan")
        old_actions = [event for event in (previous or {}).get("schedule", {}).get("events", [])
                       if event["queue_id"] == archived_id]
        if any(event["id"] not in completed_set for event in old_actions):
            raise ValueError(f"cannot remove PR {archived_id} with unfinished operation")
        entries.append(old)
        seen_branches.add(old["branch"])
        seen_files.add(old["pr_file"])
    if previous_rows and any(value not in previous_rows and value <= max(previous_rows) for value in active_ids):
        raise ValueError("new PR ID reuses historical identity; allocate above prior maximum")
    for row in rows:
        index = int(row["id"])
        if row["branch"] in seen_branches or row["pr_file"] in seen_files:
            raise ValueError("PR branches/files must be unique across active and archived history")
        seen_branches.add(row["branch"]); seen_files.add(row["pr_file"])
        if row["entry_mode"] not in ("new", "existing_open", "already_merged"):
            raise ValueError(f"invalid entry mode for PR {index}")
        if row["release"] != last_release:
            if row["release"] in closed_releases:
                raise ValueError("release rows must remain contiguous")
            if last_release:
                closed_releases.add(last_release)
            last_release = row["release"]
        if row["entry_mode"] == "already_merged" and (seen_new or seen_existing_open):
            raise ValueError("already merged entries must lead the plan")
        if row["entry_mode"] == "existing_open":
            if seen_new or seen_existing_open:
                raise ValueError("at most one existing open PR may follow the merged prefix")
            seen_existing_open = True
        if row["entry_mode"] == "new":
            seen_new = True
            if row["existing_pr_number"]:
                raise ValueError("new PR cannot have an existing PR number")
        else:
            if not row["existing_pr_number"].isdigit() or int(row["existing_pr_number"]) <= 0:
                raise ValueError("existing PR number is required")
            if row["existing_pr_number"] in seen_numbers:
                raise ValueError("duplicate existing PR number")
            seen_numbers.add(row["existing_pr_number"])
        path_value = row["pr_file"]
        if not path_value.startswith("data/"):
            raise ValueError("PR file must be under data/pullrequests")
        path = _safe_pr_path(root.parent, path_value, root / "pullrequests")
        if path.is_file():
            pr = read_pr(path)
        elif previous_rows.get(index) and all(f"{config['event_prefix']}-{index:03d}-{suffix}" in completed_set
                                            for suffix in (("merge",) if row["entry_mode"] == "existing_open" else
                                                           (() if row["entry_mode"] == "already_merged" else ("open", "merge")))):
            pr = previous_rows[index]
        else:
            raise ValueError(f"missing pending PR source: {path_value}")
        if (pr["id"] != index or pr["branch"] != row["branch"] or pr["release"] != row["release"]
                or pr["depends_on"] != (entries[-1]["branch"] if entries else config["base"])):
            raise ValueError(f"PR {index} identity/dependency differs from plan")
        if pr["version_boundary"] != (pr["branch"] == f"version/{pr['release']}"):
            raise ValueError(f"PR {index} version boundary mismatch")
        entry = {key: pr[key] for key in ("id", "branch", "depends_on", "release", "version_boundary",
                 "expected_source_commits", "outcome", "title", "body")}
        entry["source_mode"] = row["entry_mode"]
        entry["existing_pr_number"] = int(row["existing_pr_number"]) if row["existing_pr_number"] else None
        entry["pr_file"] = row["pr_file"]
        entries.append(entry)
        if row["entry_mode"] == "already_merged" and (row["open_at"] or row["merge_at"]):
            raise ValueError("already merged PR cannot have pending times")
        if row["entry_mode"] == "existing_open" and row["open_at"]:
            raise ValueError("existing open PR cannot be reopened")
        if row["entry_mode"] == "new" and not row["open_at"]:
            raise ValueError(f"new PR {index} lacks opening time")
        if row["entry_mode"] != "already_merged" and not row["merge_at"]:
            raise ValueError(f"PR {index} lacks merge time")
        opened = None
        for action, cell, suffix in (("open_pr", "open_at", "open"), ("merge_pr", "merge_at", "merge")):
            if not row[cell]:
                continue
            at = _local(row[cell], tz)
            utc = at.astimezone(timezone.utc)
            local = at.astimezone(tz)
            if (not config["start_date"] <= local.date().isoformat() <= config["end_date"]
                    or not window["from"] <= local.strftime("%H:%M") <= window["through"]):
                raise ValueError(f"PR {index} action outside configured window")
            if last_utc and utc <= last_utc:
                raise ValueError("publication times must increase in queue order")
            last_utc = utc
            if action == "open_pr":
                opened = utc
            elif opened and utc - opened < timedelta(minutes=planned_minimum):
                raise ValueError(f"PR {index} planned age below minimum")
            event_id = f"{config['event_prefix']}-{index:03d}-{suffix}"
            if len(event_id) > 64:
                raise ValueError("Scheduler event name exceeds 64 characters")
            events.append({"id": event_id, "queue_id": index, "action": action, "branch": pr["branch"],
                           "release": pr["release"], "local": at.isoformat(timespec="seconds"),
                           "utc": utc.isoformat(timespec="seconds").replace("+00:00", "Z")})
    active_files = {str(path.relative_to(root.parent)).replace("\\", "/")
                    for path in (root / "pullrequests").glob("[0-9]*-*.md")}
    active_source_files = {row["pr_file"] for row in rows}
    if active_files - active_source_files:
        raise ValueError(f"unreferenced active PR files: {sorted(active_files - active_source_files)}")
    daily_merges = Counter(event["local"][:10] for event in events if event["action"] == "merge_pr")
    if any(count > int(config.get("maximum_merges_per_day", 4)) for count in daily_merges.values()):
        raise ValueError("publication plan exceeds configured daily merge limit")
    by_id = {event["id"]: event for event in events}
    for position, row in enumerate(entries[1:], 1):
        previous_row = entries[position - 1]
        if not previous_row["version_boundary"]:
            continue
        open_event = by_id.get(f"{config['event_prefix']}-{row['id']:03d}-open")
        previous_merge = by_id.get(f"{config['event_prefix']}-{previous_row['id']:03d}-merge")
        if open_event and previous_merge:
            gap = (datetime.fromisoformat(open_event["utc"].replace("Z", "+00:00")) -
                   datetime.fromisoformat(previous_merge["utc"].replace("Z", "+00:00")))
            if gap < timedelta(minutes=int(config.get("post_release_open_minutes", 40))):
                raise ValueError("PR opens too soon after version release boundary")
    if events:
        final = datetime.fromisoformat(events[-1]["local"])
        if final.strftime("%H:%M") > config.get("final_version_merge_latest_local", "18:30"):
            raise ValueError("final version merge lacks release publication headroom")
    if len(completed) != len(completed_set):
        raise ValueError("duplicate completed event identity")
    old_events = {event["id"]: event for event in (previous or {}).get("history", {}).get("events", [])}
    old_events.update({event["id"]: event for event in (previous or {}).get("schedule", {}).get("events", [])})
    archive_events = [old_events[event_id] for event_id in completed
                      if event_id in old_events and event_id not in {event["id"] for event in events}]
    historical_records = dict((previous or {}).get("history", {}).get("records", {}))
    for archived_id in archived_ids:
        record = (progress or {}).get("prs", {}).get(str(archived_id), {})
        fields = ("number", "head_sha", "source_head_sha", "prepared_head_sha",
                  "source_base_sha", "merge_sha", "merged_at", "created_at")
        retained = {key: record[key] for key in fields if record.get(key)}
        existing_number = previous_rows[archived_id].get("existing_pr_number")
        if existing_number:
            retained.setdefault("number", existing_number)
        if retained.get("head_sha") and previous_rows[archived_id].get("source_mode") in (
                "already_merged", "existing_open"):
            retained.setdefault("source_head_sha", retained["head_sha"])
            retained.setdefault("prepared_head_sha", retained["head_sha"])
        if retained:
            historical_records[str(archived_id)] = retained
    if previous:
        for event in events:
            if event["id"] in completed_set and event != old_events.get(event["id"]):
                raise ValueError(f"completed event changed: {event['id']}")
        for row in entries:
            old = previous_rows.get(row["id"])
            if old and any(event["queue_id"] == row["id"] and event["id"] in completed_set
                           for event in old_events.values()) and row != old:
                raise ValueError(f"completed PR source changed: {row['id']}")
    releases = _release_definitions(config, entries, root, previous, completed)
    queue = {"repository": config["repository"], "entries": entries}
    schedule = {"timezone": config["timezone"], "start": config["start_date"], "end": config["end_date"],
                "events": events, "queue_sha256": queue_digest(queue)}
    snapshot = {"format": 1, "config": config, "queue": queue, "schedule": schedule,
                "history": {"events": archive_events, "records": historical_records},
                "releases": {"releases": releases}}
    validate_snapshot(snapshot)
    return snapshot


def validate_snapshot(snapshot: dict) -> None:
    if set(snapshot) not in ({"format", "config", "queue", "schedule", "releases"},
                             {"format", "config", "queue", "schedule", "releases", "history"}):
        raise ValueError("snapshot has unexpected fields")
    if snapshot["schedule"]["queue_sha256"] != queue_digest(snapshot["queue"]):
        raise ValueError("snapshot queue/schedule mismatch")
    events = snapshot["schedule"]["events"]
    historical = snapshot.get("history", {}).get("events", [])
    if len({event["id"] for event in historical + events}) != len(historical + events):
        raise ValueError("duplicate snapshot event ID")
    if events and events[-1]["action"] != "merge_pr":
        raise ValueError("snapshot must end with a merge")
