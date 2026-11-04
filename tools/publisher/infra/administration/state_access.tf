# Grant workload OpenTofu access to exactly one state key and its lock file.
data "aws_iam_policy_document" "publisher_state" {
  statement {
    sid       = "ListPublisherStateOnly"
    actions   = ["s3:ListBucket"]
    resources = [local.state_bucket_arn]

    condition {
      test     = "StringLike"
      variable = "s3:prefix"
      values   = ["aggregator-publisher/*"]
    }
  }

  statement {
    sid       = "ReadWritePublisherState"
    actions   = ["s3:GetObject", "s3:PutObject"]
    resources = ["${local.state_bucket_arn}/aggregator-publisher/tofu.tfstate"]
  }

  statement {
    sid       = "ManagePublisherStateLock"
    actions   = ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"]
    resources = ["${local.state_bucket_arn}/aggregator-publisher/tofu.tfstate.tflock"]
  }
}

resource "aws_iam_policy" "publisher_state" {
  name        = "AggregatorPublisherStateAccess"
  path        = "/"
  description = "Publisher-only OpenTofu state and lock access"
  policy      = data.aws_iam_policy_document.publisher_state.json

  lifecycle {
    prevent_destroy = true
  }
}
