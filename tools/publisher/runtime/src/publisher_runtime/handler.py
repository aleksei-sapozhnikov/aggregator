"""Apply the Publisher start-date gate before running the watchdog."""

from __future__ import annotations

import os
from datetime import datetime, timezone


def lambda_handler(event, context):
    """Reject non-watchdog events and defer execution until the configured start."""
    if not isinstance(event, dict) or event != {"reconcile": True}:
        raise RuntimeError("publisher only accepts watchdog reconciliation")
    not_before = datetime.fromisoformat(os.environ["NOT_BEFORE_UTC"].replace("Z", "+00:00"))
    if datetime.now(timezone.utc) < not_before:
        return {"status": "deferred", "reason": "configured start date not reached"}

    from lambda_publisher.handler import lambda_handler as run

    return run(event, context)
