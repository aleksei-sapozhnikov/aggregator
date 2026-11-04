"""Send redacted, size-limited failure notifications with duplicate suppression."""

from __future__ import annotations

import hashlib
import json
import re
from datetime import datetime, timezone
from urllib.parse import quote


def sanitize(value: str) -> str:
    value = re.sub(
        r"(?i)(authorization\s*[:=]\s*(?:bearer|token)\s+)\S+", r"\1[REDACTED]", value
    )
    value = re.sub(
        r"\b(?:ghp_|github_pat_|gho_|ghu_|ghs_)[A-Za-z0-9_]{12,}\b", "[REDACTED]", value
    )
    return value[:1500]


def cloudwatch_url(region: str, log_group: str, stream: str) -> str:
    group = quote(log_group, safe="")
    encoded_stream = quote(stream, safe="")
    return f"https://{region}.console.aws.amazon.com/cloudwatch/home?region={region}#logsV2:log-groups/log-group/{group}/log-events/{encoded_stream}"


def alert(
    sns,
    topic_arn: str | None,
    enabled: bool,
    progress: dict,
    *,
    event: dict,
    reason: str,
    execution_id: str,
    log_group: str = "",
    log_stream: str = "",
    region: str = "",
) -> bool:
    if not enabled or not topic_arn:
        return False
    clean = sanitize(reason)
    signature = hashlib.sha256(f"{event['id']}:{clean}".encode()).hexdigest()
    if signature in progress.setdefault("alerts", []):
        return False
    timestamp = datetime.now(timezone.utc).isoformat()
    details = {
        "operation": event["action"],
        "branch": event["branch"],
        "version": event["release"],
        "queue_id": event["queue_id"],
        "pr_number": progress.get("prs", {})
        .get(str(event["queue_id"]), {})
        .get("number"),
        "event_id": event["id"],
        "timestamp_utc": timestamp,
        "scheduled_local": event["local"],
        "scheduled_utc": event["utc"],
        "reason": clean,
        "sanitized_reason_summary": clean[:500],
        "execution_id": execution_id,
        "cloudwatch_log": cloudwatch_url(region, log_group, log_stream)
        if region and log_group and log_stream
        else "unavailable",
    }
    try:
        sns.publish(
            TopicArn=topic_arn,
            Subject=f"Aggregator publication blocked: {event['id']}",
            Message=json.dumps(details, indent=2),
        )
    except Exception as error:  # noqa: BLE001
        # Alert delivery is best-effort and must not interrupt publication handling.
        print(
            json.dumps(
                {
                    "level": "error",
                    "message": "SNS publish failed",
                    "error_type": type(error).__name__,
                }
            )
        )
        return False
    progress["alerts"].append(signature)
    return True
