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
