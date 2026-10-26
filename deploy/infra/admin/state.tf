# Protected S3 backend storage and its bucket access policy.

resource "aws_s3_bucket" "tofu_state" {
  bucket        = "aggregator-tofu-state-905418096305-eu-central-1"
  force_destroy = false

  tags = {
    Project     = "aggregator"
    Environment = "shared"
    ManagedBy   = "opentofu"
    Component   = "state"
  }

  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_s3_bucket_versioning" "tofu_state" {
  bucket = aws_s3_bucket.tofu_state.id

  versioning_configuration {
    status = "Enabled"
  }

  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "tofu_state" {
  bucket = aws_s3_bucket.tofu_state.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "tofu_state" {
  bucket                  = aws_s3_bucket.tofu_state.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_ownership_controls" "tofu_state" {
  bucket = aws_s3_bucket.tofu_state.id

  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

data "aws_iam_policy_document" "tofu_state_bucket" {
  statement {
    sid     = "DenyInsecureTransport"
    effect  = "Deny"
    actions = ["s3:*"]
    resources = [
      aws_s3_bucket.tofu_state.arn,
      "${aws_s3_bucket.tofu_state.arn}/*",
    ]

    principals {
      type        = "*"
      identifiers = ["*"]
    }

    condition {
      test     = "Bool"
      variable = "aws:SecureTransport"
      values   = ["false"]
    }
  }

  # ReadOnlyAccess must not expose privileged admin state.
  statement {
    sid     = "DenyDelegatedUserAdminStateAccess"
    effect  = "Deny"
    actions = ["s3:*"]
    resources = [
      "${aws_s3_bucket.tofu_state.arn}/admin/*",
    ]

    principals {
      type        = "AWS"
      identifiers = [aws_iam_user.aggregator_admin.arn]
    }
  }
}

resource "aws_s3_bucket_policy" "tofu_state" {
  bucket = aws_s3_bucket.tofu_state.id
  policy = data.aws_iam_policy_document.tofu_state_bucket.json

  depends_on = [aws_s3_bucket_public_access_block.tofu_state]
}
