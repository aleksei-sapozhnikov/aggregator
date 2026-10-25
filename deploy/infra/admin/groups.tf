resource "aws_iam_group" "base" {
  name = "AggregatorBaseAccess"
  path = "/"

  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_iam_group" "demo" {
  name = "AggregatorDemoAdmins"
  path = "/"

  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_iam_group" "publication" {
  name = "AggregatorPublicationAdmins"
  path = "/"

  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_iam_group" "infrastructure" {
  name = "AggregatorInfrastructureAdmins"
  path = "/"

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
