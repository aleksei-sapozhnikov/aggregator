resource "aws_iam_user" "infra_admin" {
  name = "infra-admin"
  path = "/"

  tags = {
    Project = "aggregator"
  }

  lifecycle {
    prevent_destroy = true
  }
}

data "aws_iam_policy_document" "infra_admin_assume_role" {
  statement {
    actions   = ["sts:AssumeRole"]
    resources = [aws_iam_role.infrastructure_admin.arn]
  }
}

resource "aws_iam_user_policy" "infra_admin_assume_role" {
  name   = "AssumeAggregatorInfrastructureAdminRole"
  user   = aws_iam_user.infra_admin.name
  policy = data.aws_iam_policy_document.infra_admin_assume_role.json
}

data "aws_iam_policy_document" "infrastructure_admin_trust" {
  statement {
    actions = ["sts:AssumeRole"]

    principals {
      type        = "AWS"
      identifiers = [aws_iam_user.infra_admin.arn]
    }

    condition {
      test     = "Bool"
      variable = "aws:MultiFactorAuthPresent"
      values   = ["true"]
    }
  }
}

resource "aws_iam_role" "infrastructure_admin" {
  name                 = "AggregatorInfrastructureAdminRole"
  assume_role_policy   = data.aws_iam_policy_document.infrastructure_admin_trust.json
  max_session_duration = 3600

  tags = {
    Project = "aggregator"
  }

  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_iam_role_policy" "infrastructure_admin" {
  name   = "ManageAggregatorAdministrativeInfrastructure"
  role   = aws_iam_role.infrastructure_admin.id
  policy = data.aws_iam_policy_document.infrastructure_admin_permissions.json
}
