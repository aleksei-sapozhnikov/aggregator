"""Run the single watchdog only after the legacy queue has fully completed."""

from __future__ import annotations

import json
import os
from datetime import UTC, datetime, timedelta


def legacy_finished(dynamodb, s3, *, table: str, bucket: str, last_id: str) -> bool:
    """Check durable progress against the legacy active snapshot, not elapsed time."""
    item = (
        dynamodb.Table(table)
        .get_item(Key={"pk": "QUEUE"}, ConsistentRead=True)
        .get("Item")
    )
    if not item or not item.get("data_revision"):
        return False
    from lambda_publisher.publication.publication import load_snapshot

    snapshot = load_snapshot(s3, bucket, item["data_revision"])
    progress = json.loads(item.get("progress", "{}"))
    completed = set(progress.get("completed", []))
    scheduled = {event["id"] for event in snapshot["schedule"]["events"]}
    return last_id in completed and bool(scheduled) and scheduled.issubset(completed)


def lambda_handler(event, context):
    """Fail closed until the previous publisher is finished and handoff is recorded."""
    if not isinstance(event, dict) or event != {"reconcile": True}:
        raise RuntimeError("publisher only accepts watchdog reconciliation")
    not_before = datetime.fromisoformat(os.environ["NOT_BEFORE_UTC"])
    if datetime.now(UTC) < not_before:
        return {"status": "deferred", "reason": "handoff date not reached"}

    import boto3

    ddb = boto3.resource("dynamodb")
    table = ddb.Table(os.environ["STATE_TABLE"])
    item = table.get_item(Key={"pk": "QUEUE"}, ConsistentRead=True).get("Item")
    if not item or item.get("paused") is not False:
        return {
            "status": "disabled",
            "reason": "publisher queue not initialized or paused",
        }
    if not item.get("legacy_handoff_complete"):
        if not legacy_finished(
            ddb,
            boto3.client("s3"),
            table=os.environ["LEGACY_STATE_TABLE"],
            bucket=os.environ["LEGACY_BUCKET"],
            last_id=os.environ["LEGACY_FINAL_EVENT_ID"],
        ):
            return {"status": "deferred", "reason": "legacy publication not complete"}
        # Never silently publish overdue work after a delayed handoff.
        from lambda_publisher.publication.publication import load_snapshot

        next_snapshot = load_snapshot(
            boto3.client("s3"), os.environ["PUBLICATION_BUCKET"], item["data_revision"]
        )
        progress = json.loads(item.get("progress", "{}"))
        completed = set(progress.get("completed", []))
        pending = next(
            (
                e
                for e in next_snapshot["schedule"]["events"]
                if e["id"] not in completed
            ),
            None,
        )
        if pending:
            due = datetime.fromisoformat(pending["utc"])
            if datetime.now(UTC) > due + timedelta(minutes=15):
                table.update_item(
                    Key={"pk": "QUEUE"},
                    UpdateExpression="SET paused=:yes",
                    ConditionExpression="data_revision=:revision AND paused=:no",
                    ExpressionAttributeValues={
                        ":yes": True,
                        ":no": False,
                        ":revision": item["data_revision"],
                    },
                )
                return {
                    "status": "blocked",
                    "reason": "legacy handoff delayed; replan overdue work",
                }
        table.update_item(
            Key={"pk": "QUEUE"},
            UpdateExpression="SET legacy_handoff_complete=:yes",
            ConditionExpression="data_revision=:revision AND paused=:no",
            ExpressionAttributeValues={
                ":yes": True,
                ":no": False,
                ":revision": item["data_revision"],
            },
        )
    from lambda_publisher.handler import lambda_handler as run

    return run(event, context)
