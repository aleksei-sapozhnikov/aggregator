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

resource "aws_iam_policy" "demo_ssm_management" {
  name        = "AggregatorDemoSSMManagement"
  path        = "/"
  policy      = file("${path.module}/policies/AggregatorDemoSSMManagement.json")
  description = "Manage only the Aggregator demo deployment SSM document"
  tags = {
    Project = "aggregator"
  }

  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_iam_policy" "demo_session_access" {
  name        = "AggregatorDemoSessionAccess"
  path        = "/"
  policy      = file("${path.module}/policies/AggregatorDemoSessionAccess.json")
  description = "Allow Session Manager access to serving demo and future k3s EC2"
  tags = {
    Project = "aggregator"
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

# IAM policies for GitHub demo infrastructure roles. All policy definitions
# live in the central administration root, not inside the demo workload root.

resource "aws_iam_policy" "demo_infra_read" {
  name        = "AggregatorDemoInfraRead"
  description = "Read demo infrastructure for OpenTofu planning and application"
  policy      = file("${path.module}/policies/AggregatorDemoInfraRead.json")

  tags = {
    Project     = "aggregator"
    Environment = "demo"
  }
}

resource "aws_iam_policy" "demo_infra_plan_state" {
  name        = "AggregatorDemoInfraPlanState"
  description = "Read the demo OpenTofu state and manage only its plan lock"
  policy      = file("${path.module}/policies/AggregatorDemoInfraPlanState.json")

  tags = {
    Project     = "aggregator"
    Environment = "demo"
  }
}

resource "aws_iam_policy" "demo_infra_k3s_run_command" {
  name        = "AggregatorDemoK3sRunCommand"
  description = "Run SSM configuration only on the Aggregator K3s demo instance"
  policy      = file("${path.module}/policies/AggregatorDemoK3sRunCommand.json")

  tags = {
    Project     = "aggregator"
    Environment = "demo"
  }
}
