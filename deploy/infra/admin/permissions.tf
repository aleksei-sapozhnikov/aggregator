# Managed policy attachments for each administrator group.

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

resource "aws_iam_group_policy_attachment" "bedrock_developers_model_invoke" {
  group      = aws_iam_group.bedrock_developers.name
  policy_arn = aws_iam_policy.bedrock_model.arn
}

resource "aws_iam_group_policy_attachment" "publication_publication_state_access" {
  group      = aws_iam_group.publication.name
  policy_arn = aws_iam_policy.publication_state_access.arn
}

resource "aws_iam_group_policy_attachment" "infra_admin_management" {
  group      = aws_iam_group.infrastructure.name
  policy_arn = aws_iam_policy.infrastructure_admin_management.arn
}

resource "aws_iam_group_policy_attachment" "infra_admin_change_password" {
  group      = aws_iam_group.infrastructure.name
  policy_arn = "arn:aws:iam::aws:policy/IAMUserChangePassword"
}
