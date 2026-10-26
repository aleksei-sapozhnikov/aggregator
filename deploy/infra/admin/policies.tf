# Managed policies and permissions boundaries for delegated administration.

resource "aws_iam_policy" "demo_iam_management" {
  name   = "AggregatorDemoIAMManagement"
  path   = "/"
  policy = file("${path.module}/policies/AggregatorDemoIAMManagement.json")
  tags = {
    "Project" = "aggregator"
  }

  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_iam_policy" "demo_ec2_management" {
  name        = "AggregatorDemoEC2Management"
  path        = "/"
  policy      = file("${path.module}/policies/AggregatorDemoEC2Management.json")
  description = "Manage Aggregator EC2 demo infrastructure"
  tags = {
    "Project" = "aggregator"
  }

  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_iam_policy" "demo_sg_rule_creation" {
  name        = "AggregatorDemoSGRuleCreation"
  path        = "/"
  policy      = file("${path.module}/policies/AggregatorDemoSGRuleCreation.json")
  description = "Allow creating tagged security group rules for Aggregator"
  tags = {
    "Project" = "aggregator"
  }

  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_iam_policy" "publication_management" {
  name        = "AggregatorPublicationManagement"
  path        = "/"
  policy      = file("${path.module}/policies/AggregatorPublicationManagement.json")
  description = "Manage Aggregator publication infrastructure"
  tags = {
    "Project" = "aggregator"
  }

  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_iam_policy" "demo_role_boundary" {
  name        = "AggregatorDemoRoleBoundary"
  path        = "/"
  policy      = file("${path.module}/policies/AggregatorDemoRoleBoundary.json")
  description = "Permissions boundary for Aggregator workloads"
  tags = {
    "Project" = "aggregator"
  }

  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_iam_policy" "publication_role_boundary" {
  name        = "AggregatorPublicationRoleBoundary"
  path        = "/"
  policy      = file("${path.module}/policies/AggregatorPublicationRoleBoundary.json")
  description = "Permissions boundary for Aggregator workloads"
  tags = {
    "Project" = "aggregator"
  }

  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_iam_policy" "bedrock_model" {
  name   = "AggregatorCallBedrockModel"
  path   = "/"
  policy = file("${path.module}/policies/AggregatorCallBedrockModel.json")
  tags = {
    "Environment" = "demo"
    "Project"     = "aggregator"
  }

  lifecycle {
    prevent_destroy = true
  }
}

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
