"""Execute queue steps under activation, revision, time-window, and lease checks."""

from __future__ import annotations

import json
import os
import uuid
from datetime import datetime, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

from ..github import branch_rebase, pull_requests, releases
from ..github.github_client import Retryable
from . import notifications
from .config import queue_digest
from .snapshot_state import Busy, schedule_digest


def allowed_start(now: datetime, config: dict) -> bool:
    local = now.astimezone(ZoneInfo(config["timezone"]))
    window = config.get("execution_window", config["start_window"])
    start, end = window["from"], window["through"]
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
                and local.strftime("%H:%M") > self.config.get(
                    "execution_window", self.config["start_window"]
                )["through"]
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
                "reason": "outside allowed local execution window",
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
                # Optional GitHub metadata must never roll back or block a
                # successfully recorded PR open/merge operation.
                self._reconcile_optional_metadata(event, result)
                return {"status": "completed", "event_id": event["id"], **result}
            except pull_requests.MergeNotReady as error:
                return self._retry(progress, event, str(error), execution_id, "deferred")
            except pull_requests.Deferred as error:
                return {
                    "status": "deferred",
                    "event_id": event["id"],
                    "reason": str(error),
                }
            except Retryable as error:
                return self._retry(progress, event, str(error), execution_id, "retryable")
            except notifications.OPERATION_ERRORS as error:
                # Keep the queue ordered and retry recoverable runtime failures.
                # Alert after repeated failures; never skip this event.
                return self._retry(progress, event, str(error), execution_id, "retryable")
        finally:
            self.state.release()

    def _reconcile_optional_metadata(self, event, result):
        if event["action"] not in ("open_pr", "merge_pr") or "pr" not in result:
            return
        try:
            pr = self.repo.pr(result["pr"])
            row = self.rows[event["queue_id"]]
            pull_requests.reconcile_associations_best_effort(
                self.repo, self.project, self.config, row, pr,
                attach_milestone=not (
                    event["action"] == "merge_pr" and row.get("version_boundary", False)
                ),
            )
        except Exception as error:
            # Best effort even for unexpected metadata integration failures.
            # Do not log exception contents that may contain credentials.
            print(json.dumps({
                "level": "warning",
                "event_id": event["id"],
                "message": "PR metadata synchronization failed",
                "error_type": type(error).__name__,
            }))

    def _retry(self, progress, event, reason, execution_id, status):
        clean = notifications.sanitize(reason)
        attempts = progress.setdefault("attempts", {})
        count = attempts.get(event["id"], 0) + 1
        attempts[event["id"]] = count
        self.state.save(progress)
        if count >= 3:
            self._alert(
                progress, event,
                f"publication retry needed (three or more attempts): {clean}",
                execution_id,
            )
        print(json.dumps({
            "level": "warning",
            "event_id": event["id"],
            "attempt": count,
            "reason": clean,
        }))
        return {
            "status": status,
            "event_id": event["id"],
            "reason": clean,
            "attempt": count,
        }

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
        if event["action"] == "publish_release":
            definition = self.release_defs[event["release"]]
            published = releases.publish(
                self.repo, definition, progress, save=self.state.save
            )
            return {"tag": event["release"], "url": published["url"]}
        row = self.rows[event["queue_id"]]
        record = progress.setdefault("prs", {}).setdefault(str(row["id"]), {})
        # Refresh stacked branches before their PR is opened, not just after
        # GitHub refuses a merge. Only the owned commit suffix is replayed.
        if row.get("source_mode") == "new" and row.get("expected_source_commits"):
            already_merged = False
            if event["action"] == "merge_pr" and record.get("number"):
                tracked_pr = self.repo.pr(record["number"])
                pull_requests._same_repo(tracked_pr, self.repo.repo, row["branch"])
                already_merged = bool(tracked_pr.get("merged_at"))
            if not already_merged:
                branch_rebase.ensure_clean_branch(
                    self.repo, row, record,
                    save=lambda: self.state.save(progress), now=now,
                )
        if event["action"] == "open_pr":
            scheduled_at = datetime.fromisoformat(event["utc"].replace("Z", "+00:00"))
            already_open = pull_requests.find_exact(
                self.repo,
                row,
                known_number=record.get("number"),
                scheduled_at=scheduled_at,
            )
            pr, _ = pull_requests.open_pr(
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
            before_merge=save_attempt,
        )
        record.update({"number": pr["number"], "url": pr["html_url"], **merged})
        self.state.save(progress)
        if row.get("version_boundary", False):
            releases.finalize(
                self.repo,
                self.release_defs[row["release"]],
                self.queue,
                progress,
                Path("/var/task"),
                save=self.state.save,
            )
        return {"pr": pr["number"], "merge_sha": record["merge_sha"]}
