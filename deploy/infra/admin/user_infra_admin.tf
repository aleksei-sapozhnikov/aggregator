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
