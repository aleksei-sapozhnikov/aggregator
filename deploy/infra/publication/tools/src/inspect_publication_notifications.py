#!/usr/bin/env python3
"""Inspect alert wiring without exposing endpoints, reading messages, or invoking Lambda."""

from __future__ import annotations

import argparse
import json
import sys
from typing import Any

from aws_cli import AwsCliError, aws_json


EXPECTED_ACCOUNT = "905418096305"
TOPIC_NAME = "aggregator-publication-failure"
QUEUE_NAME = "aggregator-publication-scheduler-dlq"
SCHEDULER_ROLE = "aggregator-publication-SchedulerRole-7X0C8b4I4r8Z"
FUNCTION_ROLE = "aggregator-publication-FunctionRole-UMrD5Cv9Prk0"
ALARM_NAMES = (
    "aggregator-publication-lambda-errors",
    "aggregator-publication-scheduler-dlq-visible",
)


def as_list(value: Any) -> list[Any]:
    """Normalize AWS policy fields that may be encoded as a scalar or list."""
    if value is None:
        return []
    return value if isinstance(value, list) else [value]


def parse_json_attribute(value: Any) -> Any:
    """Decode JSON text returned inside an SNS or SQS attribute."""
    if not value:
        return None
    if isinstance(value, str):
        return json.loads(value)
    return value


def policy_summary(document: Any) -> list[dict[str, Any]]:
    """Return policy statements without unrelated resource metadata."""
    parsed = parse_json_attribute(document) or {}
    statements = as_list(parsed.get("Statement"))
    return [
        {
            "sid": statement.get("Sid", ""),
            "effect": statement.get("Effect"),
            "principal": statement.get("Principal"),
            "actions": as_list(statement.get("Action")),
            "resources": as_list(statement.get("Resource")),
            "condition": statement.get("Condition"),
        }
        for statement in statements
    ]


def role_policy_summary(profile: str, region: str, role: str, policy: str) -> list[dict[str, Any]]:
    """Read one inline IAM policy and return its redacted statement summary."""
    result = aws_json(
        profile,
        region,
        "iam",
        "get-role-policy",
        "--role-name",
        role,
        "--policy-name",
        policy,
    )
    return policy_summary(result.get("PolicyDocument"))


def subscription_status(subscription_arn: str) -> str:
    """Map the SNS subscription ARN to a status without exposing its endpoint."""
    if subscription_arn == "PendingConfirmation":
        return "PendingConfirmation"
    if subscription_arn == "Deleted":
        return "Deleted"
    return "Confirmed"


def collect_report(profile: str, region: str) -> dict[str, Any]:
    """Read the named notification resources after verifying the AWS account."""
    identity = aws_json(profile, region, "sts", "get-caller-identity")
    if identity.get("Account") != EXPECTED_ACCOUNT:
        raise RuntimeError("The selected AWS profile resolved to an unexpected account.")

    topic_arn = f"arn:aws:sns:{region}:{EXPECTED_ACCOUNT}:{TOPIC_NAME}"
    queue_url = (
        f"https://sqs.{region}.amazonaws.com/{EXPECTED_ACCOUNT}/{QUEUE_NAME}"
    )
    topic = aws_json(profile, region, "sns", "get-topic-attributes", "--topic-arn", topic_arn)
    subscriptions_response = aws_json(
        profile,
        region,
        "sns",
        "list-subscriptions-by-topic",
        "--topic-arn",
        topic_arn,
        "--query",
        "Subscriptions[].{Protocol:Protocol,SubscriptionArn:SubscriptionArn,Owner:Owner}",
    )
    subscriptions = [
        {
            "protocol": subscription.get("Protocol"),
            "status": subscription_status(subscription.get("SubscriptionArn", "")),
            "owner_account": subscription.get("Owner", ""),
            "endpoint_printed": False,
        }
        for subscription in (subscriptions_response or [])
    ]

    queue_response = aws_json(
        profile,
        region,
        "sqs",
        "get-queue-attributes",
        "--queue-url",
        queue_url,
        "--attribute-names",
        "All",
    )
    queue_attributes = queue_response.get("Attributes", {})
    queue_policy = policy_summary(parse_json_attribute(queue_attributes.get("Policy")))
    redrive_policy = parse_json_attribute(queue_attributes.get("RedrivePolicy"))
    redrive_allow_policy = parse_json_attribute(queue_attributes.get("RedriveAllowPolicy"))

    alarms_response = aws_json(
        profile,
        region,
        "cloudwatch",
        "describe-alarms",
        "--alarm-names",
        *ALARM_NAMES,
    )
    alarms = []
    for alarm in alarms_response.get("MetricAlarms", []):
        alarms.append(
            {
                "name": alarm.get("AlarmName"),
                "actions_enabled": alarm.get("ActionsEnabled", False),
                "state": alarm.get("StateValue"),
                "alarm_actions": alarm.get("AlarmActions", []),
                "ok_actions": alarm.get("OKActions", []),
                "insufficient_data_actions": alarm.get("InsufficientDataActions", []),
                "metric_name": alarm.get("MetricName"),
                "namespace": alarm.get("Namespace"),
                "threshold": alarm.get("Threshold"),
                "period_seconds": alarm.get("Period"),
                "evaluation_periods": alarm.get("EvaluationPeriods"),
                "dimensions": [
                    {"name": item.get("Name"), "value": item.get("Value")}
                    for item in alarm.get("Dimensions", [])
                ],
            }
        )

    topic_attributes = topic.get("Attributes", {})
    topic_policy = policy_summary(topic_attributes.get("Policy"))
    alarm_actions_all_target_topic = len(alarms) == len(ALARM_NAMES) and all(
        topic_arn in alarm["alarm_actions"] for alarm in alarms
    )

    return {
        "account": identity["Account"],
        "region": region,
        "sns_topic": {
            "arn": topic_attributes.get("TopicArn"),
            "owner_account": topic_attributes.get("Owner"),
            "policy_statements": topic_policy,
            "subscription_count": len(subscriptions),
            "subscriptions": subscriptions,
            "endpoint_values_printed": False,
        },
        "scheduler_dlq": {
            "arn": queue_attributes.get("QueueArn"),
            "visible": int(queue_attributes.get("ApproximateNumberOfMessages", 0)),
            "in_flight": int(queue_attributes.get("ApproximateNumberOfMessagesNotVisible", 0)),
            "delayed": int(queue_attributes.get("ApproximateNumberOfMessagesDelayed", 0)),
            "visibility_timeout_seconds": int(queue_attributes.get("VisibilityTimeout", 0)),
            "message_retention_seconds": int(queue_attributes.get("MessageRetentionPeriod", 0)),
            "delay_seconds": int(queue_attributes.get("DelaySeconds", 0)),
            "maximum_message_size_bytes": int(queue_attributes.get("MaximumMessageSize", 0)),
            "receive_wait_time_seconds": int(queue_attributes.get("ReceiveMessageWaitTimeSeconds", 0)),
            "sqs_managed_sse_enabled": str(
                queue_attributes.get("SqsManagedSseEnabled", "false")
            ).lower() == "true",
            "redrive_policy": redrive_policy,
            "redrive_allow_policy": redrive_allow_policy,
            "policy_statements": queue_policy,
            "message_bodies_read": False,
        },
        "iam": {
            "scheduler_role_policy": role_policy_summary(profile, region, SCHEDULER_ROLE, "InvokeAndDlq"),
            "function_runner_policy": role_policy_summary(profile, region, FUNCTION_ROLE, "Runner"),
            "function_secret_read_policy": role_policy_summary(
                profile, region, FUNCTION_ROLE, "PublicationSecretRead"
            ),
        },
        "cloudwatch_alarms": alarms,
        "alarm_count": len(alarms),
        "alarm_actions_all_target_topic": alarm_actions_all_target_topic,
        "raw_subscription_endpoints_printed": False,
        "queue_messages_read": False,
        "lambda_invoked": False,
        "aws_resources_modified": False,
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--profile", default="aggregator-admin")
    parser.add_argument("--region", default="eu-central-1")
    args = parser.parse_args(argv)

    try:
        print(json.dumps(collect_report(args.profile, args.region), indent=2))
        return 0
    except AwsCliError as error:
        print(f"Read-only AWS inspection failed: {error}", file=sys.stderr)
        return 2
    except (KeyError, TypeError, ValueError, RuntimeError) as error:
        print(f"Read-only AWS inspection stopped: {error}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
