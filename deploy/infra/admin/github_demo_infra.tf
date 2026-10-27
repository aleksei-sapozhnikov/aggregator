# GitHub OIDC identities for the demo OpenTofu root.
# Authentication policy is centrally owned by the IAM administration root.

data "aws_iam_policy_document" "github_demo_infra_plan_trust" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRoleWithWebIdentity"]
    principals {
      type        = "Federated"
      identifiers = [aws_iam_openid_connect_provider.github_actions.arn]
    }
    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:aud"
      values   = ["sts.amazonaws.com"]
    }
    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:sub"
      values   = ["repo:aleksei-sapozhnikov/aggregator:ref:refs/heads/demo"]
    }
  }
}

data "aws_iam_policy_document" "github_demo_infra_apply_trust" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRoleWithWebIdentity"]
    principals {
      type        = "Federated"
      identifiers = [aws_iam_openid_connect_provider.github_actions.arn]
    }
    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:aud"
      values   = ["sts.amazonaws.com"]
    }
    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:sub"
      values   = ["repo:aleksei-sapozhnikov/aggregator:environment:demo-infra"]
    }
  }
}

resource "aws_iam_role" "github_demo_infra_plan" {
  name               = "AggregatorDemoInfraPlanGithub"
  description        = "Read-only GitHub OIDC role for demo infrastructure plans"
  assume_role_policy = data.aws_iam_policy_document.github_demo_infra_plan_trust.json

  tags = {
    Project     = "aggregator"
    Environment = "demo"
  }

  # Self-managed administrative permissions need to be updated before role creation.
  depends_on = [aws_iam_policy.infrastructure_admin_management]

  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_iam_role" "github_demo_infra_apply" {
  name               = "AggregatorDemoInfraApplyGithub"
  description        = "GitHub OIDC role for approved demo infrastructure changes and K3s configuration"
  assume_role_policy = data.aws_iam_policy_document.github_demo_infra_apply_trust.json

  tags = {
    Project     = "aggregator"
    Environment = "demo"
  }

  # This role can be assumed only through the protected demo-infra Environment.
  depends_on = [aws_iam_policy.infrastructure_admin_management]

  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_iam_role_policy_attachment" "github_demo_infra_plan" {
  for_each = {
    read       = aws_iam_policy.demo_infra_read.arn
    plan_state = aws_iam_policy.demo_infra_plan_state.arn
  }

  role       = aws_iam_role.github_demo_infra_plan.name
  policy_arn = each.value
}

resource "aws_iam_role_policy_attachment" "github_demo_infra_apply" {
  for_each = {
    read        = aws_iam_policy.demo_infra_read.arn
    state       = aws_iam_policy.demo_state_access.arn
    ec2         = aws_iam_policy.demo_ec2_management.arn
    iam         = aws_iam_policy.demo_iam_management.arn
    sg_rules    = aws_iam_policy.demo_sg_rule_creation.arn
    ssm_manage  = aws_iam_policy.demo_ssm_management.arn
    ssm_execute = aws_iam_policy.demo_infra_k3s_run_command.arn
  }

  role       = aws_iam_role.github_demo_infra_apply.name
  policy_arn = each.value
}
