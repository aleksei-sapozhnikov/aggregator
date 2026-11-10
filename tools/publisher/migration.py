"""Translate a paused legacy Publisher queue to explicit operations without replay."""

from __future__ import annotations

from copy import deepcopy

from lambda_publisher.publication.publication import validate_snapshot


def migrate_progress(old: dict, new: dict, progress: dict, activation_through=None):
    """Return translated progress and event IDs without changing remote state.

    Match PRs by branch rather than numeric ID: explicit release operations
    shift the IDs of subsequent PRs. Refuse ambiguous or partially published
    legacy releases instead of guessing what GitHub has already published.
    """
    validate_snapshot(old)
    validate_snapshot(new)
    if old["format"] != 1 or new["format"] != 2:
        raise ValueError("migration requires legacy format 1 and operation format 2")
    for key in ("repository", "base", "timezone"):
        if old["config"][key] != new["config"][key]:
            raise ValueError(f"migration cannot change {key}")

    old_rows = old["queue"]["entries"]
    new_rows = new["queue"]["entries"]
    old_branches = [row["branch"] for row in old_rows]
    new_branches = [row["branch"] for row in new_rows]
    if old_branches != new_branches or len(set(old_branches)) != len(old_branches):
        raise ValueError("migration requires the same ordered PR branches")
    pr_ids = {}
    for old_row, new_row in zip(old_rows, new_rows):
        for field in ("branch", "title", "body", "expected_source_commits"):
            if old_row.get(field) != new_row.get(field):
                raise ValueError(
                    f"PR {old_row['branch']} changes {field}; preserve PR source"
                )
        pr_ids[str(old_row["id"])] = str(new_row["id"])

    old_releases = old["releases"]["releases"]
    new_releases = new["releases"]["releases"]
    if [r["tag"] for r in old_releases] != [r["tag"] for r in new_releases]:
        raise ValueError("migration requires the same ordered release tags")

    old_events = old.get("history", {}).get("events", []) + old["schedule"]["events"]
    new_events = new["schedule"]["events"]
    old_by_id = {event["id"]: event for event in old_events}
    completed = progress.get("completed", [])
    if (
        len(completed) != len(set(completed))
        or completed != [event["id"] for event in old_events[: len(completed)]]
    ):
        raise ValueError("legacy completed operations are not the ordered event prefix")

    new_pr_events = {
        (event["branch"], event["action"]): event
        for event in new_events if event["action"] != "publish_release"
    }
    old_to_new = {}
    mapped_old_order = []
    completed_set = set(completed)
    for event in old_events:
        key = (event["branch"], event["action"])
        if key not in new_pr_events:
            raise ValueError(f"legacy operation has no matching new PR event: {key}")
        target = new_pr_events[key]
        if event["id"] in completed_set and event["utc"] != target["utc"]:
            raise ValueError(f"completed event time changed: {event['id']}")
        old_to_new[event["id"]] = target["id"]
        mapped_old_order.append(target["id"])

    if mapped_old_order != [
        event["id"] for event in new_events
        if event["action"] != "publish_release"
    ]:
        raise ValueError("migration cannot reorder legacy PR events")

    publish_by_tag = {
        event["release"]: event for event in new_events
        if event["action"] == "publish_release"
    }
    new_positions = {event["id"]: index for index, event in enumerate(new_events)}
    mapped_completed = {old_to_new[event_id] for event_id in completed}
    for old_release, new_release in zip(old_releases, new_releases):
        tag = old_release["tag"]
        boundary_branch = old_release["version_branch"]
        boundary_event = new_pr_events.get((boundary_branch, "merge_pr"))
        publish_event = publish_by_tag.get(tag)
        if not boundary_event or not publish_event:
            raise ValueError(f"release {tag} has no version merge/publish event")
        if new_positions[publish_event["id"]] != new_positions[boundary_event["id"]] + 1:
            raise ValueError(f"release {tag} must immediately follow its version merge")
        if old_release["title"] != new_release["title"]:
            raise ValueError(f"release {tag} title changed during migration")
        if old_release["notes"].strip() != new_release["notes"].strip():
            raise ValueError(f"release {tag} notes changed during migration")

        record = progress.get("releases", {}).get(tag, {})
        boundary_complete = boundary_event["id"] in mapped_completed
        if boundary_complete:
            if not record.get("published") or not record.get("sha") or not record.get("url"):
                raise ValueError(
                    f"legacy release {tag} is not durably published; resolve before migration"
                )
            mapped_completed.add(publish_event["id"])
        elif any(record.get(k) for k in ("sha", "tag_created", "published")):
            raise ValueError(
                f"legacy release {tag} started before its merge completed; "
                "finish or reconcile it under the legacy queue first"
            )

    expected_prefix = [event["id"] for event in new_events[: len(mapped_completed)]]
    if mapped_completed != set(expected_prefix):
        raise ValueError("translated completed operations would not be a queue prefix")

    translated = deepcopy(progress)
    translated["completed"] = expected_prefix
    original_prs = progress.get("prs", {})
    unknown = set(original_prs) - set(pr_ids)
    if unknown:
        raise ValueError(f"unrecognized legacy PR progress IDs: {sorted(unknown)}")
    translated["prs"] = {
        pr_ids[old_id]: deepcopy(record)
        for old_id, record in original_prs.items()
    }
    # Preserve explicitly reviewed PR identities for legacy existing-open rows.
    for old_row in old_rows:
        number = old_row.get("existing_pr_number")
        if number:
            translated["prs"].setdefault(
                pr_ids[str(old_row["id"])], {}
            ).setdefault("number", number)

    for name in ("attempts",):
        values = progress.get(name, {})
        if any(event_id not in old_to_new for event_id in values):
            raise ValueError(f"{name} contains unknown legacy event IDs")
        translated[name] = {
            old_to_new[event_id]: value for event_id, value in values.items()
        }
    for error in translated.get("errors", []):
        event_id = error.get("event_id")
        if event_id not in old_to_new:
            raise ValueError("error references an unknown legacy event")
        error["event_id"] = old_to_new[event_id]

    if activation_through is not None and activation_through not in old_to_new:
        raise ValueError("activation boundary is not a known legacy event")
    new_boundary = (
        old_to_new[activation_through] if activation_through is not None else None
    )
    return translated, new_boundary, {
        "old_completed": len(completed),
        "new_completed": len(expected_prefix),
        "mapped_prs": len(old_rows),
        "published_releases": sum(
            event["action"] == "publish_release"
            and event["id"] in mapped_completed for event in new_events
        ),
        "next_event": (
            new_events[len(expected_prefix)]["id"]
            if len(expected_prefix) < len(new_events) else None
        ),
    }
