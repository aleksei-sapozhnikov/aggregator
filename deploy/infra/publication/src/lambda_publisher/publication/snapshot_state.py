"""Store the active queue, progress, and processing lease in DynamoDB.

The runner reads state before handling a Scheduler event and writes it after
each step. Conditional operations check the revision and lease owner so
concurrent invocations do not merge a PR twice or overwrite another run's
progress.
"""
from __future__ import annotations

import json
import hashlib
import time
import uuid


class Busy(RuntimeError):
    pass


def schedule_digest(schedule: dict) -> str:
    raw = json.dumps(schedule, sort_keys=True, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    return hashlib.sha256(raw).hexdigest()


class SnapshotState:
    """Manage the revision-guarded QUEUE item for one Lambda invocation."""

    def __init__(self, table, revision: str, schedule: dict):
        self.table, self.revision, self.schedule = table, revision, schedule
        self.owner = None

    def read(self):
        item = self.table.get_item(Key={"pk": "QUEUE"}, ConsistentRead=True).get("Item")
        if not item:
            raise RuntimeError("publication state missing; synchronize before activation")
        if item.get("data_revision") != self.revision:
            raise RuntimeError("scheduled data revision differs from active DynamoDB revision")
        item["progress"] = json.loads(item["progress"])
        item["schedule"] = self.schedule
        item["schedule_sha256"] = schedule_digest(self.schedule)
        return item

    def acquire(self, *, seconds=900):
        owner = str(uuid.uuid4())
        now = int(time.time())
        try:
            self.table.update_item(Key={"pk": "QUEUE"},
                UpdateExpression="SET lease_owner=:owner, lease_until=:until",
                ConditionExpression="data_revision=:revision AND (attribute_not_exists(lease_until) OR lease_until<:now)",
                ExpressionAttributeValues={":owner": owner, ":until": now + seconds,
                                           ":now": now, ":revision": self.revision})
        except Exception as error:
            if error.__class__.__name__ == "ConditionalCheckFailedException":
                item = self.table.get_item(Key={"pk": "QUEUE"}, ConsistentRead=True).get("Item")
                if not item or item.get("data_revision") != self.revision:
                    raise RuntimeError("scheduled data revision is stale; inspect active snapshot") from None
                raise Busy("another invocation owns the queue") from None
            raise
        self.owner = owner
        return self.read()

    def save(self, progress: dict):
        if not self.owner:
            raise RuntimeError("lease required")
        self.table.update_item(Key={"pk": "QUEUE"}, UpdateExpression="SET progress=:progress",
            ConditionExpression="lease_owner=:owner AND lease_until>=:now AND data_revision=:revision",
            ExpressionAttributeValues={":progress": json.dumps(progress, separators=(",", ":")),
                                       ":owner": self.owner, ":now": int(time.time()),
                                       ":revision": self.revision})

    def pause_owned(self):
        self.table.update_item(Key={"pk": "QUEUE"}, UpdateExpression="SET paused=:yes",
            ConditionExpression="lease_owner=:owner AND data_revision=:revision",
            ExpressionAttributeValues={":yes": True, ":owner": self.owner, ":revision": self.revision})

    def release(self):
        if self.owner:
            self.table.update_item(Key={"pk": "QUEUE"}, UpdateExpression="REMOVE lease_owner, lease_until",
                ConditionExpression="lease_owner=:owner",
                ExpressionAttributeValues={":owner": self.owner})
            self.owner = None
