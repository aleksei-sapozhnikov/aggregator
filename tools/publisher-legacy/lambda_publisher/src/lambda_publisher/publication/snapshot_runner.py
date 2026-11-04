"""Execute queue steps under activation, revision, time-window, and lease checks."""

from __future__ import annotations

import json
import os
import uuid
from datetime import datetime, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

from ..github import pull_requests, rebase, releases
from ..github.github_client import Retryable
from . import notifications
from .config import queue_digest
from .snapshot_state import Busy, schedule_digest


def allowed_start(now: datetime, config: dict) -> bool:
    local = now.astimezone(ZoneInfo(config["timezone"]))
    start, end = config["start_window"]["from"], config["start_window"]["through"]
    return (
        config["start_date"] <= local.date().isoformat() <= config["end_date"]
        and start <= local.strftime("%H:%M") <= end
    )


class Runner:
    """Validate an incoming event and coordinate one PR or release step."""

    def __init__(
        self,
        config,
        queue,
        schedule,
        release_defs,
        repo_client,
        project_client,
        state,
        *,
        notes_root: Path | None = None,
        sns=None,
    ):
        if (
            config["repository"] != "aleksei-sapozhnikov/aggregator"
            or config["base"] != "main"
            or config["project"]["url"]
            != "https://github.com/users/aleksei-sapozhnikov/projects/1"
        ):
            raise ValueError("runtime target allowlist mismatch")
        if schedule["queue_sha256"] != queue_digest(queue):
            raise ValueError("runtime queue/schedule digest mismatch")
        self.config, self.queue, self.schedule = config, queue, schedule
        self.release_defs = {item["tag"]: item for item in release_defs["releases"]}
        self.rows = {row["id"]: row for row in queue["entries"]}
        self.queue_branches = {row["branch"] for row in queue["entries"]}
        self.repo, self.project, self.state, self.sns = (
            repo_client,
            project_client,
            state,
            sns,
        )
        self.alert_sent = False

    def next_event(self, progress):
        done = set(progress["completed"])
        return next(
            (event for event in self.schedule["events"] if event["id"] not in done),
            None,
        )

    def _alert(self, progress, event, reason, execution_id):
        if not self.sns:
            return
        sent = notifications.alert(
            self.sns,
            os.environ.get("SNS_TOPIC_ARN"),
            os.environ.get("NOTIFICATIONS_ENABLED", "false").lower() == "true",
            progress,
            event=event,
            reason=reason,
            execution_id=execution_id,
            log_group=os.environ.get("AWS_LAMBDA_LOG_GROUP_NAME", ""),
            log_stream=os.environ.get("AWS_LAMBDA_LOG_STREAM_NAME", ""),
            region=os.environ.get("AWS_REGION", ""),
        )
        self.alert_sent = self.alert_sent or sent
        self.state.save(progress)

    def run(
        self,
        event_id: str | None = None,
        *,
        dry_run=True,
        now: datetime | None = None,
        execution_id: str | None = None,
        schedule_sha: str | None = None,
        reconcile=False,
    ):
        now = now or datetime.now(timezone.utc)
        execution_id = execution_id or str(uuid.uuid4())
        if dry_run:
            item = self.state.read()
            return {
                "dry_run": True,
                "activated": item["activated"],
                "paused": item["paused"],
                "allowed_start": allowed_start(now, self.config),
                "next_event": self.next_event(item["progress"]),
            }
        if os.environ.get("ACTIVATION_ENABLED", "false").lower() != "true":
            return {"status": "disabled", "reason": "Lambda activation flag is false"}
        if (
            not reconcile
            and (not event_id or schedule_sha != schedule_digest(self.schedule))
            or reconcile
            and event_id
        ):
            raise RuntimeError(
                "scheduled event ID or immutable schedule digest missing or stale"
            )
        if not allowed_start(now, self.config):
            local = now.astimezone(ZoneInfo(self.config["timezone"]))
            if local.date().isoformat() > self.config["end_date"] or (
                local.date().isoformat() == self.config["end_date"]
                and local.strftime("%H:%M") > self.config["start_window"]["through"]
            ):
                item = self.state.read()
                if self.next_event(item["progress"]):
                    try:
                        item = self.state.acquire()
                    except Busy:
                        return {"status": "deferred", "reason": "queue lease busy"}
                    try:
                        next_event = self.next_event(item["progress"])
                        if next_event:
                            self.state.pause_owned()
                            self._alert(
                                item["progress"],
                                next_event,
                                "queue incomplete at configured cutoff",
                                execution_id,
                            )
                    finally:
                        self.state.release()
                    return {
                        "status": "deadline_missed",
                        "reason": "queue incomplete at cutoff; paused",
                    }
            return {
                "status": "deferred",
                "reason": "outside allowed local start window",
            }
        try:
            item = self.state.acquire()
        except Busy:
            return {"status": "deferred", "reason": "queue lease busy"}
        try:
            if not item["activated"] or item["paused"]:
                return {"status": "disabled", "reason": "queue inactive or paused"}
            progress = item["progress"]
            event = self.next_event(progress)
            if not event:
                return {"status": "complete"}
            if not item.get("activation_all"):
                through = item.get("activation_through")
                ids = [entry["id"] for entry in self.schedule["events"]]
                if through not in ids or ids.index(event["id"]) > ids.index(through):
                    return {
                        "status": "deferred",
                        "reason": "outside reviewed activation prefix",
                        "next_event": event["id"],
                    }
            if event_id and event["id"] != event_id:
                return {
                    "status": "deferred",
                    "reason": "out of order",
                    "next_event": event["id"],
                }
            due = datetime.fromisoformat(event["utc"].replace("Z", "+00:00"))
            if now < due:
                return {
                    "status": "deferred",
                    "reason": "event not yet due",
                    "next_event": event["id"],
                }
            try:
                result = self._execute(event, progress, now)
                progress["completed"].append(event["id"])
                progress["last_execution_id"] = execution_id
                self.state.save(progress)
                return {"status": "completed", "event_id": event["id"], **result}
            except pull_requests.Deferred as error:
                return {
                    "status": "deferred",
                    "event_id": event["id"],
                    "reason": str(error),
                }
            except Retryable as error:
                clean = notifications.sanitize(str(error))
                attempts = progress.setdefault("attempts", {})
                attempts[event["id"]] = attempts.get(event["id"], 0) + 1
                self.state.save(progress)
                if attempts[event["id"]] < 3:
                    return {
                        "status": "retryable",
                        "event_id": event["id"],
                        "reason": clean,
                        "attempt": attempts[event["id"]],
                    }
                reason = (
                    "three ambiguous GitHub attempts; operator review required: "
                    + clean
                )
                return self._block(progress, event, reason, execution_id, now)
            except Exception as error:  # noqa: BLE001
                # Persist unexpected event failures as blocked instead of aborting the run.
                return self._block(
                    progress,
                    event,
                    notifications.sanitize(str(error)),
                    execution_id,
                    now,
                )
        finally:
            self.state.release()

    def _block(self, progress, event, reason, execution_id, now):
        progress.setdefault("errors", []).append(
            {
                "event_id": event["id"],
                "reason": reason,
                "utc": now.isoformat(),
                "execution_id": execution_id,
            }
        )
        self.state.save(progress)
        self.state.pause_owned()
        self._alert(progress, event, reason, execution_id)
        print(
            json.dumps(
                {
                    "level": "error",
                    "event_id": event["id"],
                    "execution_id": execution_id,
                    "reason": reason,
                }
            )
        )
        return {"status": "blocked", "event_id": event["id"], "reason": reason}

    def _execute(self, event, progress, now):
        if self.repo.identity()["login"] != self.config["expected_actor"]:
            raise RuntimeError("repository PAT actor mismatch")
        if self.project.identity()["login"] != self.config["expected_actor"]:
            raise RuntimeError("Project PAT actor mismatch")
        row = self.rows[event["queue_id"]]
        record = progress.setdefault("prs", {}).setdefault(str(row["id"]), {})
        if event["action"] == "open_pr":
            scheduled_at = datetime.fromisoformat(event["utc"].replace("Z", "+00:00"))
            already_open = pull_requests.find_exact(
                self.repo,
                row,
                known_number=record.get("number"),
                scheduled_at=scheduled_at,
            )
            prepared_now = None
            if row["depends_on"] != self.config["base"] and already_open is None:
                predecessor = next(
                    entry
                    for entry in self.queue["entries"]
                    if entry["branch"] == row["depends_on"]
                )
                predecessor_record = progress.get("prs", {}).get(
                    str(predecessor["id"]), {}
                )
                prepared_now = rebase.prepare(
                    self.repo,
                    row,
                    record,
                    predecessor_record,
                    save=lambda: self.state.save(progress),
                )
            pr, associations = pull_requests.open_pr(
                self.repo,
                self.project,
                self.config,
                row,
                queue_branches=self.queue_branches,
                scheduled_at=scheduled_at,
                known_number=already_open["number"]
                if already_open
                else record.get("number"),
                known_head=record.get("merge_attempt_sha") or record.get("head_sha"),
            )
            if prepared_now and pr["head"]["sha"] != prepared_now:
                raise RuntimeError("PR head differs from runner-prepared branch")
            record.update(
                {
                    "number": pr["number"],
                    "url": pr["html_url"],
                    "created_at": pr["created_at"],
                    "head_sha": pr["head"]["sha"],
                    "prepared_head_sha": record.get(
                        "prepared_head_sha", pr["head"]["sha"]
                    ),
                    "source_head_sha": record.get("source_head_sha", pr["head"]["sha"]),
                    **associations,
                }
            )
            self.state.save(progress)
            return {"pr": pr["number"]}
        if row.get("source_mode") == "existing_open" and not record.get("head_sha"):
            number = row["existing_pr_number"]
            pr = self.repo.pr(number)
            pull_requests._same_repo(pr, self.repo.repo, row["branch"])
            if pr.get("number") != number or pr.get("state") != "open":
                raise RuntimeError("existing open PR identity differs from queue")
            record.update(
                {
                    "number": number,
                    "url": pr["html_url"],
                    "created_at": pr["created_at"],
                    "head_sha": pr["head"]["sha"],
                    "source_head_sha": pr["head"]["sha"],
                    "prepared_head_sha": pr["head"]["sha"],
                }
            )
            self.state.save(progress)

        def save_attempt(sha):
            record["merge_attempt_sha"] = sha
            self.state.save(progress)

        pr, merged = pull_requests.merge_pr(
            self.repo,
            self.project,
            self.config,
            row,
            now=now,
            known_head=record.get("head_sha"),
            known_number=record.get("number"),
            queue_branches=self.queue_branches,
            attempt_sha=record.get("merge_attempt_sha"),
            before_merge=save_attempt,
        )
        record.update({"number": pr["number"], "url": pr["html_url"], **merged})
        self.state.save(progress)
        if row["version_boundary"]:
            releases.finalize(
                self.repo,
                self.release_defs[row["release"]],
                self.queue,
                progress,
                Path("/var/task"),
                save=self.state.save,
            )
        return {"pr": pr["number"], "merge_sha": record["merge_sha"]}
