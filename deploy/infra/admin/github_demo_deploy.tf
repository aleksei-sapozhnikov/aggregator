# GitHub Actions OIDC identity for the demo environment only.

resource "aws_iam_openid_connect_provider" "github_actions" {
  url            = "https://token.actions.githubusercontent.com"
  client_id_list = ["sts.amazonaws.com"]
  tags = {
    Project = "aggregator"
  }
}

data "aws_iam_policy_document" "github_demo_deploy_trust" {
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
      values   = ["repo:aleksei-sapozhnikov/aggregator:environment:demo"]
    }
  }
}

resource "aws_iam_role" "github_demo_deploy" {
  name               = "AggregatorDemoDeployGithub"
  description        = "GitHub OIDC deployment role for restricted SSM commands"
  assume_role_policy = data.aws_iam_policy_document.github_demo_deploy_trust.json
  tags = {
    Project     = "aggregator"
    Environment = "demo"
  }
}

data "aws_iam_policy_document" "github_demo_deploy" {
  statement {
    sid       = "RunDedicatedDeployDocumentOnly"
    actions   = ["ssm:SendCommand"]
    resources = ["arn:aws:ssm:eu-central-1:905418096305:document/AggregatorDemoDeploy"]
  }

  statement {
    sid       = "TargetTaggedServingDemoOnly"
    actions   = ["ssm:SendCommand"]
    resources = ["arn:aws:ec2:eu-central-1:905418096305:instance/*"]
    condition {
      test     = "StringEquals"
      variable = "ssm:resourceTag/Project"
      values   = ["aggregator"]
    }
    condition {
      test     = "StringEquals"
      variable = "ssm:resourceTag/Environment"
      values   = ["demo"]
    }
    condition {
      test     = "StringEquals"
      variable = "ssm:resourceTag/Name"
      values   = ["demo-aggregator"]
    }
  }

  statement {
    sid       = "ReadCommandResults"
    actions   = ["ssm:GetCommandInvocation"]
    resources = ["*"]
  }
}

resource "aws_iam_role_policy" "github_demo_deploy" {
  name   = "AggregatorDemoSSMDeploy"
  role   = aws_iam_role.github_demo_deploy.id
  policy = data.aws_iam_policy_document.github_demo_deploy.json
}
