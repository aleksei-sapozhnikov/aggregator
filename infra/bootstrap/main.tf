# IAM users, groups, and memberships for delegated AWS administration.

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

resource "aws_iam_group" "bedrock_developers" {
  name = "AggregatorBedrockDevelopers"
  path = "/"

  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_iam_user" "aggregator_admin" {
  name = "aggregator-admin"
  path = "/"
  tags = {
    # Session Manager Run As maps this AWS identity to a regular Linux user.
    SSMSessionRunAs = "ec2-user"
  }

  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_iam_user_group_membership" "aggregator_admin" {
  user = aws_iam_user.aggregator_admin.name
  groups = [
    aws_iam_group.base.name,
    aws_iam_group.demo.name,
    aws_iam_group.bedrock_developers.name,
    aws_iam_group.publication.name,
  ]

  lifecycle {
    prevent_destroy = true
  }
}

