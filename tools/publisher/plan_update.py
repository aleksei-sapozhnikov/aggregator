"""Reconcile a replacement operations plan with already published AWS state."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

from plan import compile_operations


def _identity(operation: dict) -> tuple[str, str]:
    kind = operation.get("type")
    if kind in ("pull_request", "pr"):
        return "pull_request", operation.get("branch")
    if kind == "release":
        return "release", operation.get("tag")
    raise ValueError(f"unknown operation type: {kind}")


def _local_time(event: dict, tz: ZoneInfo) -> str:
    return datetime.fromisoformat(event["utc"].replace("Z", "+00:00")).astimezone(
        tz
    ).strftime("%Y-%m-%d %H:%M")


def _previous_operation(index: int, snapshot: dict, events: list[dict]) -> dict:
    prs = {row["id"]: row for row in snapshot["queue"]["entries"]}
    releases = {row["id"]: row for row in snapshot["releases"]["releases"]}
    tz = ZoneInfo(snapshot["config"]["timezone"])
    by_action = {event["action"]: event for event in events}
    if index in prs:
        row = prs[index]
        if row.get("source_mode", "new") != "new" or row.get("existing_pr_number"):
            raise RuntimeError("cannot reconstruct a started nonstandard PR")
        result = {
            "type": "pull_request",
            "id": index,
            "branch": row["branch"],
            "title": row["title"],
            "body": row["body"],
            "open": _local_time(by_action["open_pr"], tz),
            "merge": _local_time(by_action["merge_pr"], tz),
            "expected_source_commits": row.get("expected_source_commits", 1),
        }
        if row.get("milestone") is not None:
            result["milestone"] = row["milestone"]
        return result
    row = releases[index]
    result = {
        "type": "release",
        "id": index,
        "tag": row["tag"],
        "title": row["title"],
        "notes": row["notes"],
        "publish": _local_time(by_action["publish_release"], tz),
    }
    if row.get("previous_tag") is not None:
        result["previous_tag"] = row["previous_tag"]
    return result


def reconcile_operations_plan(
    path: Path, previous: dict, progress: dict, *, now: datetime | None = None
) -> tuple[dict, list[str]]:
    """Compile a full replacement while preserving completed/started operations.

    The authoritative record for an already started operation comes from the
    active AWS snapshot. Unstarted operations remain in the new plan even if
    their scheduled time has passed; they produce a warning, not a deletion.
    Future operations may be inserted, reordered, renamed, or removed.
    """
    if previous["format"] != 2:
        raise RuntimeError("operation plan reconciliation requires format 2")
    source = json.loads(path.read_text(encoding="utf-8-sig"))
    if not isinstance(source, dict) or not isinstance(source.get("operations"), list):
        raise ValueError("plan must contain an operations array")
    if source.get("timezone") != previous["config"]["timezone"]:
        raise ValueError("cannot change the timezone of an active queue")

    events = previous["schedule"]["events"]
    completed = progress.get("completed", [])
    if (
        len(completed) != len(set(completed))
        or completed != [event["id"] for event in events[:len(completed)]]
    ):
        raise RuntimeError("stored completed events are not an ordered prefix")
    event_groups: dict[int, list[dict]] = {}
    for event in events:
        event_groups.setdefault(event["queue_id"], []).append(event)
    ordered_ids = list(event_groups)
    protected = {event["queue_id"] for event in events[:len(completed)]}
    for id_str, row in progress.get("prs", {}).items():
        if isinstance(row, dict) and any(
            row.get(name) for name in ("number", "head_sha", "merge_sha")
        ):
            protected.add(int(id_str))
    for tag, row in progress.get("releases", {}).items():
        if isinstance(row, dict) and any(
            row.get(name) for name in ("sha", "tag_created", "published")
        ):
            protected.update(
                release["id"]
                for release in previous["releases"]["releases"]
                if release["tag"] == tag
            )
    unknown = protected - set(ordered_ids)
    if unknown:
        raise RuntimeError(f"stored publication identities are missing: {sorted(unknown)}")
    retained = ordered_ids[:1 + max(
        (ordered_ids.index(index) for index in protected), default=-1
    )]
    fixed = [
        _previous_operation(index, previous, event_groups[index])
        for index in retained
    ]
    fixed_by_identity = {_identity(operation) for operation in fixed}
    warnings: list[str] = []
    now = now or datetime.now(timezone.utc)
    if now.utcoffset() is None:
        raise ValueError("current time must include a timezone")
    tz = ZoneInfo(source["timezone"])
    kept_operations = []
    ignored_fixed: set[str] = set()
    overdue_operations = []

    for operation in source["operations"]:
        if not isinstance(operation, dict):
            raise ValueError("each operation must be an object")
        kind, value = _identity(operation)
        if (kind, value) in fixed_by_identity:
            ignored_fixed.add(str(value))
            continue
        timestamp_field = "open" if kind == "pull_request" else "publish"
        scheduled = operation.get(timestamp_field)
        if not isinstance(scheduled, str):
            raise ValueError(f"missing {timestamp_field} for {value}")
        try:
            scheduled_at = datetime.strptime(
                scheduled, "%Y-%m-%d %H:%M"
            ).replace(tzinfo=tz)
        except ValueError as error:
            raise ValueError(f"invalid {timestamp_field} for {value}") from error
        if scheduled_at.astimezone(timezone.utc) < now.astimezone(timezone.utc):
            overdue_operations.append(str(value))
        kept_operations.append(operation)

    def preview(values: list[str]) -> str:
        return ", ".join(values[:5]) + (" ..." if len(values) > 5 else "")

    if ignored_fixed:
        names = sorted(ignored_fixed)
        warnings.append(
            f"Ignored {len(names)} already started/completed operations "
            f"from JSON (preserved from AWS): {preview(names)}"
        )
    if overdue_operations:
        warnings.append(
            f"Retained {len(overdue_operations)} unstarted operations with past "
            f"scheduled times (will be eligible after resume, subject to the "
            f"execution window): {preview(overdue_operations)}"
        )
    kept_keys = {_identity(operation) for operation in kept_operations}
    removed = [
        _identity(_previous_operation(index, previous, event_groups[index]))[1]
        for index in ordered_ids[len(retained):]
        if _identity(_previous_operation(index, previous, event_groups[index]))
        not in kept_keys
    ]
    if removed:
        warnings.append(
            f"Replaced or removed {len(removed)} previously planned, unstarted "
            f"operations: {preview(removed)}"
        )
    omitted = len(fixed) - len(ignored_fixed)
    if omitted:
        warnings.append(
            f"Retained {omitted} started/completed operations missing from JSON"
        )

    last_id = fixed[-1]["id"] if fixed else 0
    normalized_future = []
    for operation in kept_operations:
        last_id += 1
        normalized_future.append({**operation, "id": last_id})
    replacement = {
        **source,
        "operations": fixed + normalized_future,
    }
    if fixed:
        first = event_groups[fixed[0]["id"]][0]["local"][:10]
        last = event_groups[fixed[-1]["id"]][-1]["local"][:10]
        replacement["start_date"] = min(source["start_date"], first)
        replacement["end_date"] = max(source["end_date"], last)
    if not replacement["operations"]:
        raise ValueError("plan has no remaining operations")
    return compile_operations(path, replacement), warnings
