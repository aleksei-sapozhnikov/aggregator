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

resource "aws_iam_user_group_membership" "infra_admin" {
  user = aws_iam_user.infra_admin.name
  groups = [
    aws_iam_group.base.name,
    aws_iam_group.infrastructure.name,
  ]

  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_iam_group_policy_attachment" "infra_admin_management" {
  group      = aws_iam_group.infrastructure.name
  policy_arn = aws_iam_policy.infrastructure_admin_management.arn
}

resource "aws_iam_group_policy_attachment" "infra_admin_change_password" {
  group      = aws_iam_group.infrastructure.name
  policy_arn = "arn:aws:iam::aws:policy/IAMUserChangePassword"
}

resource "aws_iam_user_policy_attachment" "infra_admin_local_signin" {
  user       = aws_iam_user.infra_admin.name
  policy_arn = "arn:aws:iam::aws:policy/SignInLocalDevelopmentAccess"
}

resource "aws_iam_user_policy_attachment" "infra_admin_change_password" {
  user       = aws_iam_user.infra_admin.name
  policy_arn = "arn:aws:iam::aws:policy/IAMUserChangePassword"
}

# Grant the same administrative permissions directly to the IAM user.
# The existing role is retained until direct-profile access is verified.
resource "aws_iam_user_policy" "infra_admin_management" {
  name   = "ManageAggregatorAdministrativeInfrastructure"
  user   = aws_iam_user.infra_admin.name
  policy = data.aws_iam_policy_document.infrastructure_admin_permissions.json
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
