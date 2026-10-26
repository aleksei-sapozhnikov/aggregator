"""Handle scheduled queue steps and watchdog reconciliation in AWS Lambda."""
from __future__ import annotations

import json
import os
from pathlib import Path

from .github.github_client import GitHub
from .publication.notifications import sanitize
from .publication.publication import load_snapshot
from .publication.snapshot_runner import Runner
from .publication.snapshot_state import SnapshotState


def _github_tokens() -> tuple[str, str]:
    """Load tokens from Secrets Manager or legacy environment variables.

    Called while constructing the runner at the start of a Lambda invocation.
    Configured secret ARNs take precedence, and a read failure never falls back
    to a legacy environment value.
    """
    repo_secret_arn = os.environ.get("GITHUB_SECRET_ARN")
    project_secret_arn = os.environ.get("PROJECT_SECRET_ARN")
    repo_token = None
    project_token = None

    # Only create a Secrets Manager client when an ARN actually needs reading.
    secret_client = None

    def read_secret(arn: str) -> str:
        nonlocal secret_client
        if secret_client is None:
            import boto3
            secret_client = boto3.client("secretsmanager")
        return secret_client.get_secret_value(SecretId=arn)["SecretString"]

    # Secret references take precedence. If a configured secret cannot be read,
    # fail closed rather than silently using a potentially stale env token.
    if repo_secret_arn:
        repo_token = read_secret(repo_secret_arn)
    else:
        repo_token = os.environ.get("GITHUB_TOKEN")
    if project_secret_arn:
        project_token = read_secret(project_secret_arn)
    else:
        project_token = os.environ.get("PROJECT_TOKEN")

    def decode(value: str | None, variable: str) -> str:
        if not value:
            raise RuntimeError(f"Missing GitHub credential: set {variable} in Lambda or configure its secret ARN")
        try:
            parsed = json.loads(value)
        except ValueError:
            return value
        if isinstance(parsed, dict):
            value = parsed.get("token")
            if not isinstance(value, str) or not value:
                raise RuntimeError(f"Invalid token JSON for {variable}")
            return value
        if isinstance(parsed, str) and parsed:
            return parsed
        raise RuntimeError(f"Invalid credential value for {variable}")

    repository = decode(repo_token, "GITHUB_TOKEN")
    project = decode(project_token, "PROJECT_TOKEN") if project_token else repository
    return repository, project


def build_runner(revision: str):
    import boto3
    snapshot = load_snapshot(boto3.client("s3"), os.environ["PUBLICATION_BUCKET"], revision)
    config, queue, schedule, releases = (snapshot[name] for name in
        ("config", "queue", "schedule", "releases"))
    repo_token, project_token = _github_tokens()
    repo_client = GitHub(repo_token, config["repository"])
    project_client = GitHub(project_token, config["repository"])
    state = SnapshotState(boto3.resource("dynamodb").Table(os.environ["STATE_TABLE"]), revision, schedule)
    sns = boto3.client("sns") if os.environ.get("NOTIFICATIONS_ENABLED", "false").lower() == "true" else None
    return Runner(config, queue, schedule, releases, repo_client, project_client, state, notes_root=Path("/var/task"),
                  sns=sns)


def lambda_handler(event, context):
    execution_id = getattr(context, "aws_request_id", None)
    event_id = event.get("event_id") if isinstance(event, dict) else None
    safe_event_id = sanitize(str(event_id))[:100] if event_id else None
    runner = None
    try:
        revision = event.get("data_revision") if isinstance(event, dict) else None
        reconcile = bool(isinstance(event, dict) and event.get("reconcile") is True)
        if reconcile and not event_id:
            import boto3
            item = boto3.resource("dynamodb").Table(os.environ["STATE_TABLE"]).get_item(
                Key={"pk": "QUEUE"}, ConsistentRead=True).get("Item")
            revision = item.get("data_revision") if item else None
        if not revision or (event_id and not event.get("schedule_sha256")) or (not event_id and not reconcile):
            raise RuntimeError("scheduled invocation missing immutable data revision or schedule digest")
        runner = build_runner(revision)
        print(json.dumps({"level": "info", "phase": "start", "execution_id": execution_id,
                          "event_id": safe_event_id, "kind": "scheduled" if event_id else "reconcile"}))
        result = runner.run(event_id, dry_run=False, execution_id=execution_id,
                            schedule_sha=event.get("schedule_sha256") if event_id else None,
                            reconcile=reconcile)
        print(json.dumps({"level": "info", "phase": "end", "execution_id": execution_id,
                          "event_id": result.get("event_id"), "status": result["status"]}))
        return result
    except Exception as error:
        # This path must work when secrets, state, data files, or runner construction fail.
        # Never put exception text in the alert or Lambda exception: SDK errors may contain secrets.
        reason = f"invocation failed during bootstrap or AWS access ({type(error).__name__}); inspect request ID"
        print(json.dumps({"level": "error", "execution_id": execution_id,
                          "event_id": safe_event_id, "reason": reason}))
        if (getattr(runner, "alert_sent", False) is not True and
                os.environ.get("NOTIFICATIONS_ENABLED", "false").lower() == "true" and os.environ.get("SNS_TOPIC_ARN")):
            try:
                import boto3
                from .notifications import alert
                alert(boto3.client("sns"), os.environ["SNS_TOPIC_ARN"], True, {"alerts": []},
                      event={"id": safe_event_id or "bootstrap", "action": "invoke", "branch": "",
                             "release": "", "queue_id": 0, "local": "", "utc": ""},
                      reason=reason, execution_id=execution_id or "unknown",
                      log_group=os.environ.get("AWS_LAMBDA_LOG_GROUP_NAME", ""),
                      log_stream=os.environ.get("AWS_LAMBDA_LOG_STREAM_NAME", ""),
                      region=os.environ.get("AWS_REGION", ""))
            except Exception as notify_error:
                print(json.dumps({"level": "error", "message": "failure notification unavailable",
                                  "error_type": type(notify_error).__name__}))
        raise RuntimeError("publication invocation failed; inspect CloudWatch request ID") from None
