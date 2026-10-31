# Scoped S3 administration for the project-owned state root.
# The central account administration bucket is deliberately excluded.
data "aws_iam_policy_document" "project_state_bucket_management" {
  statement {
    sid       = "CreateOnlyProjectStateBucket"
    actions   = ["s3:CreateBucket"]
    resources = [local.state_bucket_arn]
  }

  statement {
    sid = "ConfigureProjectStateBucket"
    actions = [
      "s3:GetBucketLocation",
      "s3:GetBucketVersioning",
      "s3:PutBucketVersioning",
      "s3:GetEncryptionConfiguration",
      "s3:PutEncryptionConfiguration",
      "s3:GetBucketPublicAccessBlock",
      "s3:PutBucketPublicAccessBlock",
      "s3:GetBucketOwnershipControls",
      "s3:PutBucketOwnershipControls",
      "s3:GetBucketTagging",
      "s3:PutBucketTagging",
      "s3:GetBucketPolicy",
      "s3:PutBucketPolicy",
      "s3:GetLifecycleConfiguration",
      "s3:PutLifecycleConfiguration",
      "s3:ListBucket",
    ]
    resources = [local.state_bucket_arn]
  }

  statement {
    sid       = "ReadWriteOwnStateRoot"
    actions   = ["s3:GetObject", "s3:PutObject"]
    resources = ["${local.state_bucket_arn}/state/tofu.tfstate"]
  }

  statement {
    sid       = "ManageOwnStateRootLock"
    actions   = ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"]
    resources = ["${local.state_bucket_arn}/state/tofu.tfstate.tflock"]
  }
}

resource "aws_iam_policy" "project_state_bucket_management" {
  name        = "AggregatorStateBucketManagement"
  description = "Provision and maintain only the Aggregator OpenTofu state bucket"
  policy      = data.aws_iam_policy_document.project_state_bucket_management.json

  tags = {
    Project = "aggregator"
  }

  lifecycle {
    prevent_destroy = true
  }
}
