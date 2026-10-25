#!/usr/bin/env python3
"""Snapshot existing Aggregator IAM objects into OpenTofu configuration.

Read-only: never creates, updates, or deletes AWS resources.
"""

import argparse
import json
import re
from pathlib import Path
from urllib.parse import unquote

import boto3

ACCOUNT_ID = "905418096305"
REGION = "eu-central-1"
USER = "aggregator-admin"
GROUPS = {
    "AggregatorBaseAccess": "base",
    "AggregatorDemoAdmins": "demo",
    "AggregatorPublicationAdmins": "publication",
}
POLICIES = {
    "AggregatorDemoIAMManagement": "demo_iam_management",
    "AggregatorDemoEC2Management": "demo_ec2_management",
    "AggregatorDemoSGRuleCreation": "demo_sg_rule_creation",
    "AggregatorPublicationManagement": "publication_management",
    "AggregatorDemoRoleBoundary": "demo_role_boundary",
    "AggregatorPublicationRoleBoundary": "publication_role_boundary",
}
BEDROCK_POLICY = "AggregatorCallBedrockModel"


def q(value):
    return json.dumps(value, ensure_ascii=True)


def hcl_map(values, indent="  "):
    if not values:
        return "{}"
    entries = [f"{indent}  {q(key)} = {q(str(val))}" for key, val in sorted(values.items())]
    return "{\n" + "\n".join(entries) + f"\n{indent}" + "}"


def tags_map(tags):
    return {t["Key"]: t["Value"] for t in tags}


def paginate(client, operation, result_key, **args):
    result = []
    for page in client.get_paginator(operation).paginate(**args):
        result.extend(page[result_key])
    return result


def document_as_json(document):
    if isinstance(document, dict):
        return document
    if isinstance(document, str):
        return json.loads(unquote(document))
    raise ValueError("Unexpected IAM policy document type")


def write(path, text):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text.rstrip() + "\n", encoding="utf-8")


def resource(resource_type, local_name, attributes, protected=True):
    parts = [f'resource "{resource_type}" "{local_name}" {{']
    parts += [f"  {key} = {value}" for key, value in attributes]
    if protected:
        parts.extend(["", "  lifecycle {", "    prevent_destroy = true", "  }"])
    parts.append("}")
    return "\n".join(parts)


def import_block(resource_type, local_name, import_id):
    return ("import {\n"
            f"  to = {resource_type}.{local_name}\n"
            f"  id = {q(import_id)}\n"
            "}")


def create_snapshot(session, directory, include_bedrock=False):
    managed_policies = dict(POLICIES)
    if include_bedrock:
        managed_policies[BEDROCK_POLICY] = "bedrock_model"
    iam = session.client("iam", region_name=REGION)
    sts = session.client("sts", region_name=REGION)
    actual_id = sts.get_caller_identity()["Account"]
    if actual_id != ACCOUNT_ID:
        raise RuntimeError(f"Wrong AWS account: expected {ACCOUNT_ID}, got {actual_id}")

    user = iam.get_user(UserName=USER)["User"]
    user_tags = tags_map(paginate(iam, "list_user_tags", "Tags", UserName=USER))
    actual_memberships = sorted(g["GroupName"] for g in paginate(
        iam, "list_groups_for_user", "Groups", UserName=USER
    ))
    if actual_memberships != sorted(GROUPS):
        raise RuntimeError(
            f"Unexpected {USER} group membership: {actual_memberships}; "
            f"expected {sorted(GROUPS)}. Check ownership before importing."
        )

    direct_policies = paginate(iam, "list_attached_user_policies", "AttachedPolicies", UserName=USER)
    inline_policies = paginate(iam, "list_user_policies", "PolicyNames", UserName=USER)
    if direct_policies or inline_policies:
        raise RuntimeError(
            "The IAM user still has direct policies; this snapshot deliberately "
            "manages permissions through groups only. Inspect direct attachments first."
        )

    policy_defs = []
    policy_imports = []
    summary = {"account_id": ACCOUNT_ID, "user": USER, "groups": {}, "managed_policies": {}}

    for name, local_name in managed_policies.items():
        arn = f"arn:aws:iam::{ACCOUNT_ID}:policy/{name}"
        metadata = iam.get_policy(PolicyArn=arn)["Policy"]
        if metadata["Arn"] != arn:
            raise RuntimeError(f"Unexpected path or ARN for {name}: {metadata['Arn']}")
        version = iam.get_policy_version(
            PolicyArn=arn, VersionId=metadata["DefaultVersionId"]
        )["PolicyVersion"]
        policy_json = document_as_json(version["Document"])
        policy_tags = tags_map(paginate(iam, "list_policy_tags", "Tags", PolicyArn=arn))
        policy_file = f"policies/{name}.json"
        write(directory / policy_file, json.dumps(policy_json, indent=2, ensure_ascii=True))
        attrs = [
            ("name", q(name)),
            ("path", q(metadata.get("Path", "/"))),
            ("policy", f'file("${{path.module}}/{policy_file}")'),
        ]
        if "Description" in metadata:
            attrs.append(("description", q(metadata["Description"])))
        attrs.append(("tags", hcl_map(policy_tags)))
        policy_defs.append(resource("aws_iam_policy", local_name, attrs))
        policy_imports.append(import_block("aws_iam_policy", local_name, arn))
        summary["managed_policies"][name] = {
            "arn": arn, "default_version": metadata["DefaultVersionId"],
            "tags": policy_tags
        }

    group_defs = []
    group_imports = []
    attachment_defs = []
    attachment_imports = []
    attachment_counter = 0

    for name, local_name in GROUPS.items():
        group = iam.get_group(GroupName=name)["Group"]
        inline = paginate(iam, "list_group_policies", "PolicyNames", GroupName=name)
        if inline:
            raise RuntimeError(
                f"Group {name} has unmanaged inline policies: {inline}. "
                "Inspect them before proceeding."
            )
        attrs = [("name", q(name)), ("path", q(group.get("Path", "/")))]
        group_defs.append(resource("aws_iam_group", local_name, attrs))
        group_imports.append(import_block("aws_iam_group", local_name, name))
        attachments = sorted(paginate(
            iam, "list_attached_group_policies", "AttachedPolicies", GroupName=name
        ), key=lambda p: p["PolicyArn"])
        summary["groups"][name] = [item["PolicyArn"] for item in attachments]
        for attached in attachments:
            arn = attached["PolicyArn"]
            match = re.fullmatch(rf"arn:aws:iam::{ACCOUNT_ID}:policy/([^/]+)", arn)
            if match and match.group(1) == BEDROCK_POLICY:
                raise RuntimeError(f"Unexpected Bedrock policy attachment to {name}")
            local_policy = managed_policies.get(match.group(1)) if match else None
            ref = f"aws_iam_policy.{local_policy}.arn" if local_policy else q(arn)
            short_policy = (local_policy or attached["PolicyName"]).lower()
            suffix = re.sub(r"[^a-z0-9]+", "_", short_policy).strip("_")
            attach_local = f"{local_name}_{suffix}"
            if any(f'"{attach_local}"' in val for val in attachment_defs):
                attach_local = f"{attach_local}_{attachment_counter}"
            attachment_counter += 1
            attachment_defs.append(resource("aws_iam_group_policy_attachment", attach_local, [
                ("group", f"aws_iam_group.{local_name}.name"),
                ("policy_arn", ref),
            ], protected=False))
            attachment_imports.append(import_block(
                "aws_iam_group_policy_attachment", attach_local, f"{name}/{arn}"
            ))

    user_attributes = [("name", q(USER)), ("path", q(user.get("Path", "/")))]
    if user.get("PermissionsBoundary"):
        user_attributes.append(("permissions_boundary", q(user["PermissionsBoundary"]["PermissionsBoundaryArn"])))
    user_attributes.append(("tags", hcl_map(user_tags)))
    write(directory / "users.tf", resource("aws_iam_user", "aggregator_admin", user_attributes))
    write(directory / "groups.tf", "\n\n".join(group_defs))
    write(directory / "policies.tf", "\n\n".join(policy_defs))
    write(directory / "attachments.tf", "\n\n".join(attachment_defs))
    write(directory / "memberships.tf", "\n".join([
        'resource "aws_iam_user_group_membership" "aggregator_admin" {',
        "  user = aws_iam_user.aggregator_admin.name",
        "  groups = [",
        *[f"    aws_iam_group.{GROUPS[name]}.name," for name in actual_memberships],
        "  ]",
        "",
        "  lifecycle {",
        "    prevent_destroy = true",
        "  }",
        "}",
    ]))

    all_imports = [
        import_block("aws_iam_user", "aggregator_admin", USER),
        *group_imports,
        *policy_imports,
        *attachment_imports,
        import_block(
            "aws_iam_user_group_membership", "aggregator_admin",
            "/".join([USER, *actual_memberships])
        ),
    ]
    write(directory / "imports.tf", "\n\n".join(all_imports))
    write(directory / "snapshot-summary.json", json.dumps(summary, indent=2, sort_keys=True))
    print(f"Captured {len(managed_policies)} policies, {len(GROUPS)} groups, "
          f"{len(attachment_defs)} group policy attachments, "
          f"one user and one group membership ({len(all_imports)} import blocks).")
    print(f"Output: {directory}")
    print("No AWS resources were modified.")
    if not include_bedrock:
        print("NOTE: AggregatorCallBedrockModel is deliberately excluded until the demo state migration.")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--profile", help="AWS CLI profile (omit to use default credential chain)")
    parser.add_argument("--output", default=".", help="OpenTofu admin root directory")
    parser.add_argument("--include-bedrock", action="store_true",
                        help="Include Bedrock policy only after removing it from demo state")
    args = parser.parse_args()
    directory = Path(args.output).resolve()
    session = boto3.Session(profile_name=args.profile, region_name=REGION)
    create_snapshot(session, directory, include_bedrock=args.include_bedrock)


if __name__ == "__main__":
    main()
