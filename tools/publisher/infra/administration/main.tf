# Administer only Publisher-specific permissions, not the shared IAM group itself.
provider "aws" {
  region              = "eu-central-1"
  allowed_account_ids = ["905418096305"]

  default_tags {
    tags = {
      Project    = "aggregator"
      Repository = "https://github.com/aleksei-sapozhnikov/aggregator"
    }
  }
}

locals {
  state_bucket_arn = "arn:aws:s3:::aggregator-project-tofu-state-905418096305-eu-central-1"
}

data "aws_iam_group" "publication_admins" {
  group_name = "AggregatorPublicationAdmins"
}

resource "aws_iam_policy" "publisher_management" {
  name        = "AggregatorPublisherManagement"
  path        = "/"
  description = "Manage only the independent Publisher infrastructure"
  policy      = file("${path.module}/policies/AggregatorPublisherManagement.json")

  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_iam_policy" "publisher_role_boundary" {
  name        = "AggregatorPublisherRoleBoundary"
  path        = "/"
  description = "Permissions boundary for Publisher Lambda and Scheduler"
  policy      = file("${path.module}/policies/AggregatorPublisherRoleBoundary.json")

  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_iam_group_policy_attachment" "publisher_management" {
  group      = data.aws_iam_group.publication_admins.group_name
  policy_arn = aws_iam_policy.publisher_management.arn
}

resource "aws_iam_group_policy_attachment" "publisher_state" {
  group      = data.aws_iam_group.publication_admins.group_name
  policy_arn = aws_iam_policy.publisher_state.arn
}
