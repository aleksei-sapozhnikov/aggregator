# The saved plan is an opaque, sensitive binary stored outside public
# GitHub artifacts. Permissions are separate from the OpenTofu state keys.

data "aws_iam_policy_document" "demo_plan_artifacts_write" {
  statement {
    sid       = "UploadWriteOnceDemoPlan"
    actions   = ["s3:PutObject"]
    resources = ["${local.state_bucket_arn}/plans/demo/*"]

    condition {
      test     = "StringEquals"
      variable = "s3:if-none-match"
      values   = ["*"]
    }
  }
}

resource "aws_iam_policy" "demo_plan_artifacts_write" {
  name        = "AggregatorDemoPlanArtifactsWrite"
  description = "Upload a new, immutable demo plan to the dedicated S3 prefix"
  policy      = data.aws_iam_policy_document.demo_plan_artifacts_write.json

  tags = {
    Project     = "aggregator"
    Environment = "demo"
  }
}

data "aws_iam_policy_document" "demo_plan_artifacts_read" {
  statement {
    sid       = "DownloadApprovedDemoPlan"
    actions   = ["s3:GetObject"]
    resources = ["${local.state_bucket_arn}/plans/demo/*"]
  }
}

resource "aws_iam_policy" "demo_plan_artifacts_read" {
  name        = "AggregatorDemoPlanArtifactsRead"
  description = "Download a saved demo plan only after GitHub environment approval"
  policy      = data.aws_iam_policy_document.demo_plan_artifacts_read.json

  tags = {
    Project     = "aggregator"
    Environment = "demo"
  }
}
