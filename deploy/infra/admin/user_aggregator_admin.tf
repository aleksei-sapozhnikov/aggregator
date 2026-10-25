resource "aws_iam_user" "aggregator_admin" {
  name = "aggregator-admin"
  path = "/"
  tags = {}

  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_iam_user_group_membership" "aggregator_admin" {
  user = aws_iam_user.aggregator_admin.name
  groups = [
    aws_iam_group.base.name,
    aws_iam_group.demo.name,
    aws_iam_group.publication.name,
  ]

  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_iam_group_policy_attachment" "base_readonlyaccess" {
  group      = aws_iam_group.base.name
  policy_arn = "arn:aws:iam::aws:policy/ReadOnlyAccess"
}

resource "aws_iam_group_policy_attachment" "base_signinlocaldevelopmentaccess" {
  group      = aws_iam_group.base.name
  policy_arn = "arn:aws:iam::aws:policy/SignInLocalDevelopmentAccess"
}

resource "aws_iam_group_policy_attachment" "demo_demo_ec2_management" {
  group      = aws_iam_group.demo.name
  policy_arn = aws_iam_policy.demo_ec2_management.arn
}

resource "aws_iam_group_policy_attachment" "demo_demo_iam_management" {
  group      = aws_iam_group.demo.name
  policy_arn = aws_iam_policy.demo_iam_management.arn
}

resource "aws_iam_group_policy_attachment" "demo_demo_sg_rule_creation" {
  group      = aws_iam_group.demo.name
  policy_arn = aws_iam_policy.demo_sg_rule_creation.arn
}

resource "aws_iam_group_policy_attachment" "publication_publication_management" {
  group      = aws_iam_group.publication.name
  policy_arn = aws_iam_policy.publication_management.arn
}

resource "aws_iam_group_policy_attachment" "demo_state_access" {
  group      = aws_iam_group.demo.name
  policy_arn = aws_iam_policy.demo_state_access.arn
}
