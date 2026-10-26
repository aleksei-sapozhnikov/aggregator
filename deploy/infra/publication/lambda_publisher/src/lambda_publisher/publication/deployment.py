"""Prepare queue revisions for upload while preserving verified publication progress."""
from __future__ import annotations

import csv
import io
import json
import re
import shutil
import tempfile
import time
from datetime import date, datetime
from decimal import Decimal
from pathlib import Path

from .publication import canonical, compile_sources, digest, validate_snapshot
from .replan import replan
from .source_format import PR_FIELDS, plan_csv, read_plan, read_pr, render_pr
from .sync import _comparable, progress_from, verify_history

MODES = ("replan-only", "prepare-and-replan")
REQUIRED_OUTPUTS = {"PublicationBucketName", "StateTableName", "ScheduleGroupName",
                    "PublicationFunctionArn", "SchedulerRoleArn", "SchedulerDlqArn", "WatchdogName"}


def portable(value):
    if isinstance(value, Decimal):
        return int(value) if value == value.to_integral_value() else float(value)
    if isinstance(value, dict):
        return {key: portable(val) for key, val in value.items()}
    if isinstance(value, (list, tuple)):
        return [portable(val) for val in value]
    if isinstance(value, datetime):
        return value.isoformat()
    return value


def fingerprint(value):
    return digest(canonical(portable(value)))


def file_hashes(root: Path, *, exclude=()) -> dict:
    return {path.relative_to(root).as_posix(): digest(path.read_bytes())
            for path in sorted(root.rglob("*")) if path.is_file() and
            path.relative_to(root).as_posix() not in exclude and
            "__pycache__" not in path.parts and path.suffix != ".pyc"}


def check_files(root: Path, files: dict):
    for name, expected in files.items():
        path = (root / name).resolve()
        if not path.is_relative_to(root.resolve()) or not path.is_file() or digest(path.read_bytes()) != expected:
            raise RuntimeError(f"reviewed file checksum changed: {name}; restore package and rerun --dry-run")


def check_package(root: Path) -> dict:
    manifest = json.loads((root / "manifest.json").read_text(encoding="utf-8"))
    if manifest.get("format") != 2 or manifest.get("mode") not in MODES:
        raise RuntimeError("unsupported deployment manifest; regenerate with plan_update.py")
    check_files(root, manifest["files"])
    extras = set(file_hashes(root)) - set(manifest["files"]) - {"manifest.json", "SHA256SUMS.txt"}
    if any(not name.startswith(".review/") for name in extras):
        raise RuntimeError("unexpected executable/package files; extract the ZIP into a clean directory")
    # The manifest itself is also covered by the operator's checksum list.
    checksums = {}
    for line in (root / "SHA256SUMS.txt").read_text(encoding="utf-8").splitlines():
        sha, name = line.split("  ", 1)
        checksums[name] = sha
    if checksums != {**manifest["files"], "manifest.json": digest((root / "manifest.json").read_bytes())}:
        raise RuntimeError("deployment manifest/checksum list changed")
    return manifest


def queue_identity(item: dict) -> dict:
    """Include unknown durable fields; ignore only transient lease/sync bookkeeping."""
    ignored = {"lease_owner", "lease_until", "sync_owner", "sync_until", "sync_resume",
               "sync_watchdog_enabled", "sync_review", "sync_pending"}
    result = {key: portable(val) for key, val in item.items() if key not in ignored}
    if "progress" in result:
        result["progress"] = progress_from(item)
    return result


def assert_idle(item: dict):
    for field in ("lease_until", "sync_until"):
        if int(item.get(field, 0)) >= int(time.time()):
            raise RuntimeError(f"QUEUE has an active {field}; wait for the owner to finish and rerun")


def schedule_identity(actual: dict) -> dict:
    return {name: portable(_comparable(definition)) for name, definition in actual.items()}


def reconcile_sources(source: Path, previous: dict, target: Path, manifest: dict):
    """Adopt live old metadata/times; append only explicitly verified new identities."""
    validate_snapshot(previous)
    proposed_config = json.loads((source / "config.yaml").read_text(encoding="utf-8-sig"))
    config = json.loads(canonical(previous["config"]))
    if (config["repository"] != manifest["repository"] or config["event_prefix"] != manifest["campaign"] or
            proposed_config["repository"] != config["repository"] or config["timezone"] != "Europe/Belgrade"):
        raise RuntimeError("catalog and live snapshot campaign/repository/timezone differ")
    # This package changes scheduling and appends work, never runtime safety policy.
    for key, value in proposed_config.items():
        if key not in ("end_date", "release_titles") and config.get(key) != value:
            raise RuntimeError(f"live safety policy differs from prepared catalog: {key}")
    prior = {row["id"]: row for row in previous["queue"]["entries"]}
    prepared = read_plan(source / "publication-plan.csv")
    by_id = {int(row["id"]): row for row in prepared}
    if len(by_id) != len(prepared):
        raise RuntimeError("duplicate catalog queue ID")
    branches = manifest.get("branches", [])
    branch_ids = {row["id"] for row in branches}
    if len(branch_ids) != len(branches):
        raise RuntimeError("duplicate branch verification ID")
    if manifest["mode"] == "replan-only" and branches:
        raise RuntimeError("replan-only cannot add branches")
    for branch in branches:
        row = by_id.get(branch["id"])
        if (not row or row["branch"] != branch["branch"] or
                not isinstance(branch.get("commit"), str) or not re.fullmatch(r"[0-9a-f]{40}", branch["commit"]) or
                branch.get("remote_sha") != branch["commit"] or branch.get("local_sha") != branch["commit"] or
                branch.get("status") != "verified"):
            raise RuntimeError("prepared branch is missing verified remote head evidence")
        metadata = read_pr(source / Path(row["pr_file"]).relative_to("data"))
        if branch["id"] in prior and any(metadata[key] != prior[branch["id"]][key] for key in (*PR_FIELDS, "body")):
            raise RuntimeError(f"prepared ID conflicts with immutable live metadata: {branch['id']}")
    added = ([row for row in prepared if int(row["id"]) not in prior]
             if manifest["mode"] == "prepare-and-replan" else [])
    if any(int(row["id"]) not in branch_ids or int(row["id"]) <= max(prior, default=0) for row in added):
        raise RuntimeError("unverified new branch or reused queue ID; reconcile catalog before scheduling")
    if target.exists():
        raise ValueError("review data directory already exists")
    target.mkdir(parents=True)
    (target / "pullrequests").mkdir()
    (target / "releases").mkdir()
    events = {(event["queue_id"], event["action"]): event for event in previous["schedule"]["events"]}
    active_ids = {index for index, _ in events}
    rows = []
    for index, metadata in prior.items():
        if index not in active_ids:
            continue
        path = target / Path(metadata["pr_file"]).relative_to("data")
        if path.parent != target / "pullrequests":
            raise RuntimeError("unsafe live PR metadata path")
        path.write_text(render_pr(metadata), encoding="utf-8")
        rows.append({"id": str(index), "branch": metadata["branch"], "release": metadata["release"],
                     "open_at": events.get((index, "open_pr"), {}).get("local", ""),
                     "merge_at": events.get((index, "merge_pr"), {}).get("local", ""),
                     "pr_file": metadata["pr_file"], "entry_mode": metadata["source_mode"],
                     "existing_pr_number": str(metadata.get("existing_pr_number") or "")})
    for row in added:
        path = Path(row["pr_file"]).relative_to("data")
        if path.parent != Path("pullrequests"):
            raise RuntimeError("unsafe prepared PR metadata path")
        shutil.copyfile(source / path, target / path)
        rows.append({**row, "open_at": "", "merge_at": ""})
        tag = row["release"]
        config["release_titles"].setdefault(tag, proposed_config["release_titles"][tag])
        shutil.copyfile(source / "releases" / f"{tag}.md", target / "releases" / f"{tag}.md")
    for release in previous["releases"]["releases"]:
        (target / "releases" / f"{release['tag']}.md").write_text(release["notes"], encoding="utf-8")
    (target / "config.yaml").write_bytes(canonical(config))
    (target / "publication-plan.csv").write_bytes(plan_csv(rows))


def finalize(source: Path, target: Path, previous: dict, item: dict, manifest: dict, *, today: date):
    if item.get("data_revision") != digest(canonical(previous)):
        raise RuntimeError("QUEUE revision does not match immutable S3 snapshot")
    assert_idle(item)
    if item.get("sync_pending") or item.get("sync_resume"):
        raise RuntimeError("interrupted synchronization exists; retry its reviewed --apply before replanning")
    progress = progress_from(item)
    verify_history(previous, item, previous)
    reconcile_sources(source, previous, target, manifest)
    report = replan(target, previous, progress, today=today,
                    deadline=date.fromisoformat(manifest["inclusive_deadline"]),
                    daily_event_range=manifest.get("planning", {}).get("daily_event_range"))
    proposed = compile_sources(target, previous=previous, completed=progress["completed"], progress=progress)
    verify_history(proposed, item, previous)
    old = {row["id"]: row for row in previous["queue"]["entries"]}
    if any(row != old[row["id"]] for row in proposed["queue"]["entries"] if row["id"] in old):
        raise RuntimeError("immutable queue metadata changed")
    old_releases = {release["tag"]: release for release in previous["releases"]["releases"]}
    if any(release != old_releases[release["tag"]] for release in proposed["releases"]["releases"]
           if release["tag"] in old_releases):
        raise RuntimeError("immutable release metadata changed")
    return proposed, report


def provisional_catalog(source: Path, *, today: date, deadline: date, mode: str, daily_event_range=None):
    """Preview the complete local catalog. Never manufacture live PR progress records.

    Deployment mode controls live reconciliation in finalize(), not the scope of
    the local calendar: blank dates on prepared rows must be planned here too.
    """
    status = json.loads((source / "catalog-status.json").read_text(encoding="utf-8"))
    known = status["known_local_completed"]
    seed_path = source / "archive/october-2026/publication-seed.json"
    if not seed_path.is_file():
        seed_path = source.parent / "archive/october-2026/publication-seed.json"
    seed = json.loads(seed_path.read_text(encoding="utf-8"))
    with tempfile.TemporaryDirectory() as temp:
        folder = Path(temp)
        baseline = folder / "baseline/data"
        baseline.parent.mkdir()
        shutil.copytree(source, baseline)
        rows = read_plan(baseline / "publication-plan.csv")
        timed = [row for row in rows if row["open_at"] or row["merge_at"]]
        for row in rows:
            if row not in timed:
                (baseline / Path(row["pr_file"]).relative_to("data")).unlink()
        config = json.loads((baseline / "config.yaml").read_text(encoding="utf-8-sig"))
        config["release_titles"] = {tag: title for tag, title in config["release_titles"].items()
                                    if tag in {row["release"] for row in timed}}
        (baseline / "config.yaml").write_bytes(canonical(config))
        (baseline / "publication-plan.csv").write_bytes(plan_csv(timed))
        previous = compile_sources(baseline, previous=seed, completed=known)
        target = folder / "proposal/data"
        target.parent.mkdir()
        shutil.copytree(source, target)
        report = replan(target, previous, {"completed": known}, today=today, deadline=deadline,
                        preview_only=True, daily_event_range=daily_event_range)
        proposed = compile_sources(target, previous=previous, completed=known)
        return proposed, {**report, "live_state_verified": False,
                          "known_completed_from_local_record": known,
                          "completion_inferred_from_dates": False, "planning_date": today.isoformat(),
                          "inclusive_deadline": deadline.isoformat(), "mode": mode,
                          "preview_scope": "complete_local_catalog",
                          "status": "provisional only; CloudShell must reconcile every historical operation"}


def calendar_csv(snapshot: dict, *, today: date) -> bytes:
    output = io.StringIO(newline="")
    fields = ("id", "queue_id", "branch", "action", "release", "local", "utc", "status")
    writer = csv.DictWriter(output, fieldnames=fields)
    writer.writeheader()
    for event in snapshot["schedule"]["events"]:
        status = ("protected_local_time_outcome_unverified" if event["local"][:10] <= today.isoformat()
                  else "provisional_future_time")
        writer.writerow({**event, "status": status})
    return output.getvalue().encode("utf-8")


def verify_review(root: Path, manifest: dict, review: dict, *, item: dict, previous: dict,
                  actual: dict, outputs: dict, today: date):
    """Allow only the original state or provable intermediate states of this apply."""
    check_files(root / ".review", review["files"])
    if review["package_sha256"] != fingerprint(manifest) or review["outputs"] != portable(outputs):
        raise RuntimeError("package or stack outputs changed; rerun --dry-run")
    if review["today"] != today.isoformat():
        raise RuntimeError("Belgrade calendar day changed; rerun --dry-run to protect today's events")
    assert_idle(item)
    expected = review["item"]
    proposed = json.loads((root / ".review/snapshot.json").read_text(encoding="utf-8"))
    revision = digest(canonical(proposed))
    if revision != review["proposed_revision"]:
        raise RuntimeError("reviewed snapshot checksum changed")
    review_id = fingerprint(review)
    recovering = item.get("sync_review") == review_id and item.get("sync_pending") is True
    live = queue_identity(item)
    original = queue_identity(expected)
    if recovering:
        original["paused"] = item.get("paused") if expected.get("paused") is False else True
        if item.get("data_revision") not in (expected["data_revision"], revision):
            raise RuntimeError("interrupted apply has an incompatible revision")
        original["data_revision"] = item["data_revision"]
    elif item.get("sync_review") == review_id and item.get("sync_pending") is False:
        original["data_revision"] = revision  # Successful no-op retry.
    if live != original:
        raise RuntimeError("QUEUE revision, progress or activation changed since dry run; rerun --dry-run after reconciliation")
    if digest(canonical(previous)) != item["data_revision"]:
        raise RuntimeError("live immutable snapshot does not match QUEUE")
    if item["data_revision"] == revision:
        if canonical(previous) != canonical(proposed):
            raise RuntimeError("live proposed snapshot changed")
    elif canonical(previous) != (root / ".review/previous-snapshot.json").read_bytes():
        raise RuntimeError("live old snapshot changed")
    before = review["actual"]
    desired = review["desired"]
    if recovering:
        for name in set(actual) | set(before) | set(desired):
            allowed = []
            if name in before:
                allowed.append(portable(_comparable(before[name])))
            if name in desired:
                allowed.extend([portable(_comparable(desired[name])), portable(_comparable({**desired[name], "State": "DISABLED"}))])
            if name == outputs["WatchdogName"] and name in before:
                allowed.append(portable(_comparable({**before[name], "State": "DISABLED"})))
            removable = name in review["diff"]["schedules"]["remove"]
            creatable = name in review["diff"]["schedules"]["create"]
            if name not in actual:
                if removable or creatable:
                    continue
            elif portable(_comparable(actual[name])) in allowed:
                continue
            raise RuntimeError(f"Scheduler state incompatible with interrupted apply: {name}")
    elif item.get("sync_review") == review_id and item.get("sync_pending") is False:
        final = {**before, **desired}
        for name in review["diff"]["schedules"]["remove"]:
            final.pop(name, None)
        if schedule_identity(actual) != schedule_identity(final):
            raise RuntimeError("Scheduler changed after apply; rerun --dry-run")
    elif schedule_identity(actual) != schedule_identity(before):
        raise RuntimeError("Scheduler changed since dry run; rerun --dry-run")
    verify_history(proposed, item, previous)
    return proposed, review_id
