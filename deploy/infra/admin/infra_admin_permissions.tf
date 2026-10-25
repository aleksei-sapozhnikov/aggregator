data "aws_iam_policy_document" "infrastructure_admin_permissions" {
  statement {
    sid     = "ManageAggregatorIAM"
    actions = ["iam:*"]
    resources = [
      "arn:aws:iam::905418096305:user/aggregator-admin",
      "arn:aws:iam::905418096305:user/infra-admin",
      "arn:aws:iam::905418096305:group/Aggregator*",
      "arn:aws:iam::905418096305:policy/Aggregator*",
    ]
  }

  # Temporary access to retire the exposed legacy Bedrock API key user.
  # Remove this statement after the credential and IAM user have been deleted.
  statement {
    sid = "RetireLegacyBedrockKeyUser"
    actions = [
      "iam:UpdateServiceSpecificCredential",
      "iam:DeleteServiceSpecificCredential",
      "iam:DetachUserPolicy",
      "iam:DeleteUser",
    ]
    resources = [
      "arn:aws:iam::905418096305:user/BedrockAPIKey-33vz",
    ]
  }

  statement {
    sid       = "ReadIAMForPlans"
    actions   = ["iam:Get*", "iam:List*", "iam:SimulateCustomPolicy", "iam:SimulatePrincipalPolicy"]
    resources = ["*"]
  }

  statement {
    sid     = "ManageOpenTofuStateBucket"
    actions = ["s3:*"]
    resources = [
      aws_s3_bucket.tofu_state.arn,
      "${aws_s3_bucket.tofu_state.arn}/*",
    ]
  }
}

resource "aws_iam_policy" "infrastructure_admin_management" {
  name        = "AggregatorInfrastructureManagement"
  description = "Manage Aggregator IAM configuration and OpenTofu state"
  policy      = data.aws_iam_policy_document.infrastructure_admin_permissions.json

  tags = {
    Project = "aggregator"
  }

  lifecycle {
    prevent_destroy = true
  }
}
