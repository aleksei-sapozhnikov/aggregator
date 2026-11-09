# Access to workload state keys and lock files for delegated administrators.

data "aws_iam_policy_document" "demo_state_access" {
  statement {
    sid       = "ListDemoStateOnly"
    effect    = "Allow"
    actions   = ["s3:ListBucket"]
    resources = [local.state_bucket_arn]

    condition {
      test     = "StringLike"
      variable = "s3:prefix"
      values   = ["demo/*"]
    }
  }

  statement {
    sid       = "ReadWriteDemoState"
    effect    = "Allow"
    actions   = ["s3:GetObject", "s3:PutObject"]
    resources = ["${local.state_bucket_arn}/demo/tofu.tfstate"]
  }

  statement {
    sid       = "ManageDemoStateLock"
    effect    = "Allow"
    actions   = ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"]
    resources = ["${local.state_bucket_arn}/demo/tofu.tfstate.tflock"]
  }
}

resource "aws_iam_policy" "demo_state_access" {
  name        = "AggregatorDemoStateAccess"
  description = "Access to the demo OpenTofu state and lock only"
  policy      = data.aws_iam_policy_document.demo_state_access.json

  tags = {
    Project = "aggregator"
  }

  lifecycle {
    prevent_destroy = true
  }
}
