"""Manage a JSON publication plan and a single AWS watchdog without per-PR schedules."""

from __future__ import annotations

import argparse
import hashlib
import importlib
import json
import os
import subprocess
import sys
import time
import zipfile
from datetime import datetime, timedelta, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

from html_calendar import save
from plan import compile_plan

ROOT = Path(__file__).resolve().parent
# The Lambda runtime is not an installed package when this CLI runs locally.
sys.path.insert(0, str(ROOT / "runtime" / "src"))
publication = importlib.import_module("lambda_publisher.publication.publication")
canonical = publication.canonical
digest = publication.digest
load_snapshot = publication.load_snapshot

ACCOUNT = "905418096305"
REGION = "eu-central-1"
PREFIX = "aggregator-publisher"
BUCKET = f"{PREFIX}-data-{ACCOUNT}-{REGION}"
TABLE = f"{PREFIX}-state"
REMOTE = "git@github.com:aleksei-sapozhnikov/aggregator.git"


def _session(profile: str):
    try:
        import boto3
    except ImportError as error:
        raise RuntimeError("Install boto3 to use --live, apply, pause, or resume") from error
    session = boto3.Session(profile_name=profile, region_name=REGION)
    identity = session.client("sts").get_caller_identity()
    if identity["Account"] != ACCOUNT:
        raise RuntimeError("AWS account differs from publisher account allowlist")
    return session


def _ddb(session):
    return session.resource("dynamodb").Table(TABLE)


def _state(table):
    return table.get_item(Key={"pk": "QUEUE"}, ConsistentRead=True).get("Item")


def _progress(item):
    raw = item.get("progress", "{}")
    result = json.loads(raw) if isinstance(raw, str) else raw
    if not isinstance(result, dict) or not isinstance(result.get("completed", []), list):
        raise RuntimeError("invalid progress in DynamoDB")
    return result


def _validate_history(current: dict, proposed: dict, completed: list[str]) -> None:
    old_events = current["schedule"]["events"]
    new_events = proposed["schedule"]["events"]
    old_by = {event["id"]: event for event in old_events}
    new_by = {event["id"]: event for event in new_events}
    if len(completed) != len(set(completed)) or any(event_id not in old_by for event_id in completed):
        raise RuntimeError("DynamoDB progress does not match existing snapshot")
    if [e["id"] for e in new_events[:len(completed)]] != completed:
        raise RuntimeError("completed operations must remain the exact ordered prefix")
    for event_id in completed:
        if new_by[event_id] != old_by[event_id]:
            raise RuntimeError(f"cannot reschedule completed event: {event_id}")
    old_rows = {row["id"]: row for row in current["queue"]["entries"]}
    new_rows = {row["id"]: row for row in proposed["queue"]["entries"]}
    if any(index not in new_rows for index in old_rows):
        raise RuntimeError("cannot remove existing PRs; preserve queue identity")
    finished_ids = {old_by[event_id]["queue_id"] for event_id in completed}
    for index in finished_ids:
        if new_rows[index] != old_rows[index]:
            raise RuntimeError(f"cannot edit partially or fully published PR {index}")
    if [e["id"] for e in new_events[:len(old_events)]] != [e["id"] for e in old_events]:
        raise RuntimeError("existing operation order cannot change; append new PRs instead")
    old_releases = {r["tag"]: r for r in current["releases"]["releases"]}
    new_releases = {r["tag"]: r for r in proposed["releases"]["releases"]}
    done_releases = {old_by[e]["release"] for e in completed}
    if any(new_releases.get(tag) != old_releases[tag] for tag in done_releases):
        raise RuntimeError("release definition for a started release is immutable")
    if current["config"]["previous_published_tag"] != proposed["config"]["previous_published_tag"]:
        raise RuntimeError("previous published tag cannot change within the same queue")


def _next_due(snapshot: dict, completed: list[str]):
    done = set(completed)
    for event in snapshot["schedule"]["events"]:
        if event["id"] not in done:
            return datetime.fromisoformat(event["utc"].replace("Z", "+00:00")), event["id"]
    return None


def _enough_time(snapshot: dict, completed: list[str]) -> None:
    next_due = _next_due(snapshot, completed)
    if next_due and next_due[0] < datetime.now(timezone.utc) + timedelta(minutes=20):
        raise RuntimeError(f"next pending event {next_due[1]} is too close or overdue; revise the JSON plan")


def _verify_remote_branches(snapshot: dict) -> None:
    branches = [row["branch"] for row in snapshot["queue"]["entries"]]
    if not branches:
        return
    command = ["git", "ls-remote", "--heads", REMOTE, "refs/heads/main"]
    command.extend(f"refs/heads/{branch}" for branch in branches)
    result = subprocess.run(command, capture_output=True, text=True, timeout=45, check=False)
    if result.returncode != 0:
        raise RuntimeError("GitHub branch inspection failed; verify SSH authentication")
    found = {line.split("\t")[1].strip() for line in result.stdout.splitlines() if "\t" in line}
    missing = set(f"refs/heads/{branch}" for branch in branches) - found
    if "refs/heads/main" not in found or missing:
        raise RuntimeError(f"missing GitHub branch refs: {sorted(missing)}")


def apply(plan: Path, profile: str) -> None:
    proposed = compile_plan(plan)
    session = _session(profile)
    table = _ddb(session)
    item = _state(table)
    if item is not None and item.get("paused") is not True:
        raise RuntimeError("pause publisher before applying a new plan")
    if item and (item.get("sync_pending") or int(item.get("lease_until", 0)) >= int(time.time())):
        raise RuntimeError("active lease or incomplete synchronization; inspect live queue")
    progress = _progress(item) if item else {"completed": [], "prs": {}, "attempts": {}, "errors": [], "alerts": []}
    if item:
        old = load_snapshot(session.client("s3"), BUCKET, item["data_revision"])
        _validate_history(old, proposed, progress["completed"])
    _enough_time(proposed, progress["completed"])
    _verify_remote_branches(proposed)
    raw = canonical(proposed)
    revision = digest(raw)
    key = f"snapshots/{revision}.json"
    s3 = session.client("s3")
    try:
        existing = s3.get_object(Bucket=BUCKET, Key=key)["Body"].read()
        if existing != raw:
            raise RuntimeError("snapshot key collision or corrupted S3 object")
    except s3.exceptions.NoSuchKey:
        s3.put_object(Bucket=BUCKET, Key=key, Body=raw, ContentType="application/json", IfNoneMatch="*")
    if not item:
        table.put_item(
            Item={"pk": "QUEUE", "data_revision": revision, "paused": True,
                  "activated": True, "activation_all": True,
                  "progress": json.dumps(progress, separators=(",", ":"))},
            ConditionExpression="attribute_not_exists(pk)",
        )
    elif item["data_revision"] != revision:
        table.update_item(
            Key={"pk": "QUEUE"}, UpdateExpression="SET data_revision=:new",
            ConditionExpression="data_revision=:old AND paused=:yes AND (attribute_not_exists(lease_until) OR lease_until<:now)",
            ExpressionAttributeValues={":new": revision, ":old": item["data_revision"],
                                       ":yes": True, ":now": int(time.time())},
        )
    print(f"Staged {len(proposed['schedule']['events'])} operations in S3: {revision}")
    print("Publication remains PAUSED. Explicitly run `resume` after reviewing the calendar.")


def _validate_blocked_retry(snapshot: dict, progress: dict, *, now: datetime) -> str:
    """Allow an operator to retry only today's recorded blocked event."""
    next_due = _next_due(snapshot, progress["completed"])
    if not next_due or next_due[0] > now:
        raise RuntimeError("no overdue event to retry")
    due, event_id = next_due
    errors = progress.get("errors", [])
    if not errors or errors[-1].get("event_id") != event_id:
        raise RuntimeError("next event has no matching recorded block")
    config = snapshot["config"]
    tz = ZoneInfo(config["timezone"])
    local_now, local_due = now.astimezone(tz), due.astimezone(tz)
    window = config.get("execution_window", config["start_window"])
    if (
        local_now.date() != local_due.date()
        or not config["start_date"] <= local_now.date().isoformat() <= config["end_date"]
        or not window["from"] <= local_now.strftime("%H:%M") <= window["through"]
    ):
        raise RuntimeError("blocked event can only be retried during its scheduled day and execution window")
    return event_id


def set_paused(paused: bool, profile: str, *, retry_blocked: bool = False) -> None:
    session = _session(profile)
    table = _ddb(session)
    item = _state(table)
    if not item:
        raise RuntimeError("queue not initialized; apply a plan first")
    if not paused:
        snapshot = load_snapshot(session.client("s3"), BUCKET, item["data_revision"])
        progress = _progress(item)
        if retry_blocked:
            if item.get("paused") is not True or item.get("sync_pending"):
                raise RuntimeError("blocked retry requires a paused, synchronized queue")
            event_id = _validate_blocked_retry(
                snapshot, progress, now=datetime.now(timezone.utc)
            )
            print(f"Retrying blocked event: {event_id}")
        else:
            _enough_time(snapshot, progress["completed"])
        _verify_remote_branches(snapshot)
    table.update_item(
        Key={"pk": "QUEUE"}, UpdateExpression="SET paused=:new",
        ConditionExpression="data_revision=:revision AND (attribute_not_exists(lease_until) OR lease_until<:now)",
        ExpressionAttributeValues={":new": paused, ":revision": item["data_revision"], ":now": int(time.time())},
    )
    print("Publisher PAUSED" if paused else "Publisher ARMED")


def live(profile: str):
    session = _session(profile)
    table = _ddb(session)
    item = _state(table)
    if not item:
        raise RuntimeError("publisher QUEUE not initialized")
    snapshot = load_snapshot(session.client("s3"), BUCKET, item["data_revision"])
    return snapshot, _progress(item), bool(item.get("paused", True)), item["data_revision"]


def build(zip_path: Path) -> None:
    root = ROOT / "runtime" / "src"
    files = sorted(p for p in root.rglob("*.py") if "__pycache__" not in p.parts)
    if not any(p.relative_to(root).as_posix() == "publisher_runtime/handler.py" for p in files):
        raise RuntimeError("publisher Lambda handler missing")
    zip_path.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as archive:
        for file in files:
            archive.write(file, file.relative_to(root).as_posix())
    print(f"Lambda build: {zip_path}")
    print(f"SHA256: {hashlib.sha256(zip_path.read_bytes()).hexdigest()}")


def main(argv=None) -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--profile", default=os.environ.get("AWS_PROFILE", "aggregator-admin"))
    commands = parser.add_subparsers(dest="command", required=True)
    for name in ("validate", "preview", "apply"):
        command = commands.add_parser(name)
        command.add_argument("plan", type=Path)
        if name == "preview":
            command.add_argument("--html", type=Path, default=Path("calendar.html"))
    cal = commands.add_parser("calendar")
    cal.add_argument("--live", action="store_true", required=True)
    cal.add_argument("--output", type=Path, default=Path("calendar.html"))
    commands.add_parser("pause")
    resume = commands.add_parser("resume")
    resume.add_argument(
        "--retry-blocked", action="store_true",
        help="retry today's recorded blocked event during the execution window",
    )
    builder = commands.add_parser("build")
    builder.add_argument("--zip", type=Path, default=ROOT / "build" / "publisher.zip")
    args = parser.parse_args(argv)
    if args.command in ("validate", "preview"):
        snapshot = compile_plan(args.plan)
        print(f"Valid: {len(snapshot['queue']['entries'])} PRs, {len(snapshot['schedule']['events'])} operations")
        for event in snapshot["schedule"]["events"]:
            print(f"  {event['local']}: {event['id']} / {event['branch']}")
        if args.command == "preview":
            save(args.html, snapshot, paused=False, revision="local preview")
            print(f"HTML preview: {args.html}")
    elif args.command == "apply":
        apply(args.plan, args.profile)
    elif args.command == "calendar":
        snapshot, progress, paused, revision = live(args.profile)
        save(args.output, snapshot, progress, paused=paused, revision=revision)
        print(f"HTML calendar: {args.output}")
    elif args.command in ("pause", "resume"):
        set_paused(
            args.command == "pause", args.profile,
            retry_blocked=getattr(args, "retry_blocked", False),
        )
    elif args.command == "build":
        build(args.zip)


if __name__ == "__main__":
    try:
        main()
    except (OSError, ValueError, RuntimeError) as error:
        raise SystemExit(f"Publisher stopped: {error}") from None
