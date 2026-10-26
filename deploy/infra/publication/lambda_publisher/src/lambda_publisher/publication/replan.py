"""Reschedule pending queue events while preserving identity and completed operations."""
from __future__ import annotations

import json
import hashlib
from collections import Counter
from datetime import date, datetime, timedelta, timezone
from functools import lru_cache
from pathlib import Path
from zoneinfo import ZoneInfo

from .publication import compile_sources
from .source_format import _local, plan_csv, read_plan


def validate_daily_event_range(value):
    if value is None:
        return
    if (not isinstance(value, dict) or set(value) != {"minimum", "maximum"} or
            any(type(value[key]) is not int for key in value) or
            not 1 <= value["minimum"] < value["maximum"] <= 100):
        raise ValueError("daily event range requires integer minimum < maximum, between 1 and 100")


def _distribute(movable, scheduled, predecessors, config, *, today, deadline, event_range):
    """Partition operations into varied daily batches, with no inactive future days.

    The range counts openings plus merges on every day through the deadline; the
    existing daily merge cap and publication windows remain independent guards.
    """
    minimum, maximum = event_range["minimum"], event_range["maximum"]
    tz = ZoneInfo(config["timezone"])
    protected_at = _local(scheduled[-1][0][scheduled[-1][1]], tz) if scheduled else None
    first = today + timedelta(days=1)
    span = (deadline - first).days + 1
    total = len(movable)
    cap = int(config["maximum_merges_per_day"])
    protected_merges = Counter(_local(row[cell], tz).date()
                               for row, cell, _ in scheduled if cell == "merge_at")
    protected_counts = Counter(_local(row[cell], tz).date()
                               for row, cell, _ in scheduled if _local(row[cell], tz).date() > today)
    age = max(90, int(config.get("minimum_planned_open_minutes", 90)))

    def advance(at, minutes):
        return (at.astimezone(timezone.utc) + timedelta(minutes=minutes)).astimezone(tz)

    def place(offset, count, day, prior):
        cursor = datetime.fromisoformat(f"{day}T{config['start_window']['from']}:00").replace(tzinfo=tz)
        merges = protected_merges[day]
        opened, times = {}, []
        for index in range(offset, offset + count):
            row, cell, _ = movable[index]
            if prior is not None:
                gap = 25
                predecessor = predecessors.get(int(row["id"]) - 1)
                if cell == "open_at" and predecessor and predecessor["branch"] == f"version/{predecessor['release']}":
                    gap = max(gap, int(config.get("post_release_open_minutes", 40)))
                cursor = max(cursor, advance(prior, gap))
            if cell == "merge_at":
                opening = opened.get(row["id"])
                if opening is None:
                    # A merge at the start of a batch follows either yesterday's
                    # movable opening or its immutable, already recorded opening.
                    if index > 0 and movable[index - 1][0] is row and movable[index - 1][1] == "open_at":
                        opening = prior
                    elif row["open_at"]:
                        opening = _local(row["open_at"], tz)
                if opening is not None:
                    cursor = max(cursor, advance(opening, age))
                merges += 1
            else:
                opened[row["id"]] = cursor
            limit = config["start_window"]["through"]
            if cell == "merge_at" and row["branch"] == f"version/{row['release']}":
                limit = min(limit, config.get("final_version_merge_latest_local", limit))
            if cursor.date() != day or cursor.strftime("%H:%M") > limit or merges > cap:
                return None
            times.append(cursor)
            prior = cursor
        return tuple(times)

    days = [first + timedelta(days=i) for i in range(span)]
    targets = [minimum + int.from_bytes(hashlib.sha256(
        f"{config['event_prefix']}:{deadline}:{day}".encode()).digest()[:4], "big") % (maximum - minimum + 1)
               for day in days]
    lower = [max(0, minimum - protected_counts[day]) for day in days]
    upper = [maximum - protected_counts[day] for day in days]
    suffix_lower, suffix_upper = [0] * (span + 1), [0] * (span + 1)
    for index in range(span - 1, -1, -1):
        suffix_lower[index] = lower[index] + suffix_lower[index + 1]
        suffix_upper[index] = upper[index] + suffix_upper[index + 1]

    @lru_cache(None)
    def solve(position, offset, prior, first_total, varied):
        if position == span:
            return (0, ()) if offset == total and (span == 1 or varied) else None
        best = None
        for count in range(lower[position], min(upper[position], total - offset) + 1):
            remaining = total - offset - count
            if not suffix_lower[position + 1] <= remaining <= suffix_upper[position + 1]:
                continue
            times = place(offset, count, days[position], prior)
            if times is None:
                continue
            daily_total = protected_counts[days[position]] + count
            rest = solve(position + 1, offset + count, times[-1] if times else prior,
                         daily_total if position == 0 else first_total,
                         varied or (position > 0 and daily_total != first_total))
            if rest is None:
                continue
            score = (daily_total - targets[position]) ** 2 + rest[0]
            candidate = (score, (times,) + rest[1])
            if best is None or score < best[0]:
                best = candidate
        return best

    result = solve(0, 0, protected_at, 0, False)
    if result is not None:
        return [at for times in result[1] for at in times]
    raise ValueError(f"deadline {deadline} infeasible for a non-even {minimum}-{maximum} openings + merges "
                     f"on every calendar day from {first}, with no inactive days, within the existing "
                     f"{cap}-merge daily limit and publication windows")


def replan(root: Path, previous: dict, progress: dict, *, today: date,
           deadline: date, preview_only=False, daily_event_range=None) -> dict:
    validate_daily_event_range(daily_event_range)
    config = json.loads((root / "config.yaml").read_text(encoding="utf-8-sig"))
    tz = ZoneInfo(config["timezone"])
    if config["timezone"] != "Europe/Belgrade":
        raise ValueError("replanning requires Europe/Belgrade")
    if deadline <= today:
        raise ValueError("deadline must leave at least one eligible future day")
    completed = set(progress.get("completed", []))
    old_events = {e["id"]: e for e in previous.get("history", {}).get("events", []) +
                  previous["schedule"]["events"]}
    rows = read_plan(root / "publication-plan.csv")
    predecessors = {row["id"]: row for row in previous["queue"]["entries"]}
    predecessors.update({int(row["id"]): row for row in rows})
    prefix = config["event_prefix"]
    existing_ids = {row["id"] for row in previous["queue"]["entries"]}
    scheduled = []
    movable = []
    order = []
    unreconciled = []
    for row in rows:
        for suffix, cell in (("open", "open_at"), ("merge", "merge_at")):
            if not row[cell] and int(row["id"]) in existing_ids:
                continue
            event_id = f"{prefix}-{int(row['id']):03d}-{suffix}"
            entry = (row, cell, event_id)
            order.append(event_id)
            old = old_events.get(event_id)
            if not old:
                if int(row["id"]) in existing_ids:
                    raise ValueError(f"active event absent from prior snapshot: {event_id}")
                movable.append(entry)
                continue
            if row[cell] != old["local"]:
                raise ValueError(f"source time already differs from active plan: {event_id}")
            event_date = _local(row[cell], tz).date()
            if event_id not in completed and event_date < today:
                if not preview_only:
                    raise ValueError(f"missed unfinished event requires reconciliation: {event_id}")
                unreconciled.append(event_id)
            (scheduled if event_id in completed or event_date <= today else movable).append(entry)
    if not movable:
        raise ValueError("no eligible future operations")
    # The active schedule is sequential. Its completed/today prefix is immutable.
    all_ops = scheduled + movable
    if [entry[2] for entry in all_ops] != order:
        raise ValueError("protected operation appears after a movable operation")
    distributed = (_distribute(movable, scheduled, predecessors, config, today=today,
                              deadline=deadline, event_range=daily_event_range)
                   if daily_event_range else None)
    first_day = today + timedelta(days=1)
    cursor = datetime.combine(first_day, datetime.min.time(), tzinfo=tz)
    if scheduled:
        cursor = max(cursor, _local(scheduled[-1][0][scheduled[-1][1]], tz).astimezone(tz) + timedelta(minutes=1))
    merges_per_day = {}
    for row, cell, event_id in scheduled:
        if cell == "merge_at":
            day = _local(row[cell], tz).date()
            merges_per_day[day] = merges_per_day.get(day, 0) + 1
    moved = []
    minimum = max(90, int(config.get("minimum_planned_open_minutes", 90)))
    earliest = config["start_window"]["from"]
    latest = config["start_window"]["through"]
    for position, (row, cell, event_id) in enumerate(movable):
        if distributed is not None:
            old_time = row[cell]
            row[cell] = distributed[position].isoformat(timespec="seconds")
            moved.append({"id": event_id, "from": old_time, "to": row[cell]})
            continue
        is_merge = cell == "merge_at"
        previous_open = _local(row["open_at"], tz) if is_merge and row["open_at"] else None
        if is_merge and previous_open:
            cursor = max(cursor, previous_open.astimezone(tz) + timedelta(minutes=minimum))
        if cell == "open_at" and int(row["id"]) > 1:
            predecessor = predecessors.get(int(row["id"]) - 1)
            if predecessor and predecessor["branch"] == f"version/{predecessor['release']}":
                cursor += timedelta(minutes=int(config.get("post_release_open_minutes", 40)))
        while True:
            day = cursor.date()
            if day > deadline + timedelta(days=365):
                raise ValueError("publication window cannot fit the queue within one year; inspect policy")
            wall = cursor.strftime("%H:%M")
            if wall < earliest:
                cursor = datetime.fromisoformat(f"{day}T{earliest}:00").replace(tzinfo=tz)
                continue
            limit = min(latest, config.get("final_version_merge_latest_local", latest)) if (
                is_merge and row["branch"] == f"version/{row['release']}") else latest
            if wall > limit or (is_merge and merges_per_day.get(day, 0) >= int(config["maximum_merges_per_day"])):
                next_day = day + timedelta(days=1)
                cursor = datetime.fromisoformat(f"{next_day}T{earliest}:00").replace(tzinfo=tz)
                continue
            break
        old_time = row[cell]
        row[cell] = cursor.isoformat(timespec="seconds")
        moved.append({"id": event_id, "from": old_time, "to": row[cell]})
        if is_merge:
            merges_per_day[cursor.date()] = merges_per_day.get(cursor.date(), 0) + 1
        cursor = (cursor.astimezone(timezone.utc) + timedelta(minutes=25)).astimezone(tz)
    config["end_date"] = max(config["end_date"], deadline.isoformat(),
                             moved[-1]["to"][:10])
    (root / "config.yaml").write_text(json.dumps(config, indent=2) + "\n", encoding="utf-8")
    (root / "publication-plan.csv").write_bytes(plan_csv(rows))
    snapshot = compile_sources(root, previous=previous, completed=progress.get("completed", []), progress=progress)
    if snapshot["queue"]["entries"][:len(previous["queue"]["entries"])] != previous["queue"]["entries"]:
        raise ValueError("replan changed prepared queue contents")
    final = snapshot["schedule"]["events"][-1]
    earliest_finish = datetime.fromisoformat(final["local"]).date()
    if earliest_finish > deadline:
        raise ValueError(f"deadline {deadline} infeasible; earliest planned final release is "
                         f"{earliest_finish}. Choose that date or later, or review the queue.")
    daily = {}
    operations = [(change["id"], change["to"]) for change in moved]
    if daily_event_range:
        operations += [(event_id, row[cell]) for row, cell, event_id in scheduled
                       if _local(row[cell], tz).date() > today]
    for event_id, at in sorted(operations, key=lambda operation: operation[1]):
        day = at[:10]
        counts = daily.setdefault(day, {"openings": 0, "closures": 0, "total": 0})
        counts["closures" if event_id.endswith("-merge") else "openings"] += 1
        counts["total"] += 1
    return {"provisional": preview_only, "unreconciled_historical_events": unreconciled,
            "protected": [entry[2] for entry in scheduled], "rescheduled": moved,
            "daily_event_range": daily_event_range, "daily_activity": daily,
            "no_inactive_days": daily_event_range is not None,
            "finish_on_deadline": daily_event_range is not None,
            "last_release_merge": final["local"]}
