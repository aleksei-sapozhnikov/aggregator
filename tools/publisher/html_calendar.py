"""Render a standalone HTML calendar from snapshot and durable progress."""

from __future__ import annotations

import html
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

CSS = """
:root{font-family:system-ui,-apple-system,Segoe UI,Arial,sans-serif;color:#192434;background:#f5f7fa}
*{box-sizing:border-box}body{max-width:1150px;margin:0 auto;padding:32px 18px}
a{color:#135eaf}header{display:flex;justify-content:space-between;flex-wrap:wrap;gap:10px;align-items:center}
h1{font-size:1.65rem;margin:0}small,.muted{color:#677384}p{line-height:1.5}
.stats{display:flex;flex-wrap:wrap;gap:12px;margin:20px 0 26px}.stat{background:white;border:1px solid #dce3eb;border-radius:10px;padding:14px 20px;min-width:150px}
.stat b{display:block;font-size:1.6rem}.days{display:grid;grid-template-columns:repeat(auto-fit,minmax(315px,1fr));gap:14px}
.day{background:white;border:1px solid #dce3eb;border-radius:12px;padding:16px}.day h2{font-size:1rem;margin:0 0 14px}
.item{border-left:4px solid #bbc6d0;background:#f8fafc;padding:12px;margin-top:10px;border-radius:6px}
.item.merged,.item.published{border-left-color:#238261}.item.open{border-left-color:#2468b3}.item.blocked{border-left-color:#c44646}.item.overdue{border-left-color:#b66b18}
.head{display:flex;justify-content:space-between;gap:8px;align-items:flex-start;font-weight:650}
.pill{font-size:.73rem;font-weight:650;background:#e9eef4;border-radius:99px;padding:4px 9px;white-space:nowrap}
.merged .pill,.published .pill{background:#d9f3e7;color:#156746}.blocked .pill{background:#ffdfdf;color:#943333}
.open .pill{background:#e0edff;color:#1c5595}.overdue .pill{background:#fff0d2;color:#85530b}
.meta{font-size:.87rem;color:#526072;margin:7px 0 0;line-height:1.6;overflow-wrap:anywhere}
footer{margin-top:26px;border-top:1px solid #dce3eb;padding-top:15px;font-size:.85rem;color:#677384}
@media(prefers-color-scheme:dark){:root{color:#e6edf5;background:#111827}.stat,.day{background:#1d2837;border-color:#384355}.item{background:#253245}.muted,small,.meta,footer{color:#abb8c9}a{color:#83b8ff}}
"""


def _esc(value) -> str:
    return html.escape(str(value), quote=True)


def render(snapshot: dict, progress: dict | None = None, *, paused: bool = True,
           checked_at: datetime | None = None, revision: str = "preview") -> str:
    progress = progress or {}
    done = set(progress.get("completed", []))
    records = progress.get("prs", {})
    errors = progress.get("errors", [])
    tz = ZoneInfo(snapshot["config"]["timezone"])
    now = checked_at or datetime.now(timezone.utc)
    if now.tzinfo is None:
        raise ValueError("checked_at must be timezone-aware")
    now_local = now.astimezone(tz)
    events = {e["id"]: e for e in snapshot["schedule"]["events"]}
    groups = defaultdict(list)
    merged_count = open_count = published_count = 0
    for row in snapshot["queue"]["entries"]:
        index = row["id"]
        prefix = snapshot["config"]["event_prefix"]
        open_id, merge_id = f"{prefix}-{index:03d}-open", f"{prefix}-{index:03d}-merge"
        opened = events.get(open_id)
        merged = events.get(merge_id)
        if not opened or not merged:
            continue
        record = records.get(str(index), {})
        if merge_id in done:
            status = "Merged"
            merged_count += 1
        elif open_id in done:
            status = "Open"
            open_count += 1
        else:
            status = "Scheduled"
        next_id = merge_id if open_id in done else open_id
        if status != "Merged" and paused and any(
            error.get("event_id") == next_id for error in errors[-10:]
        ):
            status = "Blocked"
        if status == "Scheduled" and not paused and now > datetime.fromisoformat(opened["utc"].replace("Z", "+00:00")):
            status = "Overdue"
        open_time = datetime.fromisoformat(opened["local"])
        merge_time = datetime.fromisoformat(merged["local"])
        link = (f'https://github.com/{snapshot["config"]["repository"]}/pull/{int(record["number"])}'
                if record.get("number") else "")
        title = _esc(row["title"])
        title_markup = f'<a href="{_esc(link)}" rel="noopener noreferrer">{title}</a>' if link else title
        actual = []
        if record.get("created_at"):
            actual.append(f'Opened: {_esc(record["created_at"])}')
        if record.get("merged_at"):
            actual.append(f'Merged: {_esc(record["merged_at"])}')
        detail = ("<div class=\"meta\">" + " · ".join(actual) + "</div>") if actual else ""
        groups[open_time.date().isoformat()].append((
            open_time,
            f'<article class="item {status.lower()}"><div class="head"><span>#{index} · {title_markup}</span>'
            f'<span class="pill">{_esc(status)}</span></div>'
            f'<div class="meta">{_esc(open_time.strftime("%H:%M"))} open · {_esc(merge_time.strftime("%H:%M"))} merge'
            f' · {_esc(row.get("release") or "PR")}</div>{detail}</article>'
        ))
    planned_releases = [
        release for release in snapshot["releases"]["releases"] if "id" in release
    ]
    for release in planned_releases:
        index, tag = release["id"], release["tag"]
        event_id = f'{snapshot["config"]["event_prefix"]}-{index:03d}-publish'
        event = events.get(event_id)
        if event is None:
            continue
        when = datetime.fromisoformat(event["local"])
        if event_id in done:
            status = "Published"
            published_count += 1
        elif paused and any(
            error.get("event_id") == event_id for error in errors[-10:]
        ):
            status = "Blocked"
        elif not paused and now > datetime.fromisoformat(
            event["utc"].replace("Z", "+00:00")
        ):
            status = "Overdue"
        else:
            status = "Scheduled"
        url = progress.get("releases", {}).get(tag, {}).get("url")
        title = _esc(release["title"])
        title_markup = (
            f'<a href="{_esc(url)}" rel="noopener noreferrer">{title}</a>'
            if url else title
        )
        groups[when.date().isoformat()].append((
            when,
            f'<article class="item {status.lower()}"><div class="head">'
            f'<span>Release {title_markup} · {_esc(tag)}</span>'
            f'<span class="pill">{_esc(status)}</span></div>'
            f'<div class="meta">{_esc(when.strftime("%H:%M"))} publish</div></article>',
        ))
    cards = "".join(
        f'<section class="day"><h2>{_esc(datetime.fromisoformat(day).strftime("%a, %d %b %Y"))}</h2>'
        + "".join(markup for _, markup in sorted(items, key=lambda entry: entry[0]))
        + '</section>'
        for day, items in sorted(groups.items())
    ) or '<p>No operations are scheduled. Add entries to the JSON plan.</p>'
    total = len(snapshot["queue"]["entries"])
    state = "Paused" if paused else "Running"
    return (
        '<!doctype html><html lang="en"><head><meta charset="utf-8">'
        '<meta name="viewport" content="width=device-width,initial-scale=1">'
        '<title>Publication Calendar</title><style>' + CSS + '</style></head><body>'
        '<header><div><h1>Publication Calendar</h1><small>'
        + _esc(snapshot["config"]["timezone"]) + ' · '
        + _esc(snapshot["config"]["start_date"]) + ' – ' + _esc(snapshot["config"]["end_date"])
        + '</small></div><strong>' + state + '</strong></header>'
        + '<div class="stats">'
        + f'<div class="stat"><b>{total}</b><small>Total PRs</small></div>'
        + f'<div class="stat"><b>{merged_count}</b><small>Merged</small></div>'
        + f'<div class="stat"><b>{open_count}</b><small>Open</small></div>'
        + f'<div class="stat"><b>{len(planned_releases)}</b><small>Releases</small></div>'
        + f'<div class="stat"><b>{published_count}</b><small>Published</small></div>'
        + f'<div class="stat"><b>{total-merged_count}</b><small>PRs remaining</small></div>'
        + '</div><main class="days">' + cards + '</main><footer>Snapshot: '
        + _esc(revision) + ' · Generated: ' + _esc(now_local.isoformat(timespec="minutes"))
        + '. This is a static export; rerun calendar --live to refresh.</footer></body></html>'
    )


def save(path: Path, snapshot: dict, progress: dict | None = None, **kwargs) -> None:
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(render(snapshot, progress, **kwargs), encoding="utf-8")
