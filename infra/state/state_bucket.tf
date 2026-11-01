# Aggregator workload-state bucket, provisioned by the delegated
# aggregator-admin identity using an initially local OpenTofu state.
# Move this root state into the new S3 bucket after first creation.

resource "aws_s3_bucket" "aggregator_state" {
  bucket        = "aggregator-project-tofu-state-905418096305-eu-central-1"
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

resource "aws_s3_bucket_versioning" "aggregator_state" {
  bucket = aws_s3_bucket.aggregator_state.id

  versioning_configuration {
    status = "Enabled"
  }

  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "aggregator_state" {
  bucket = aws_s3_bucket.aggregator_state.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "aggregator_state" {
  bucket                  = aws_s3_bucket.aggregator_state.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_ownership_controls" "aggregator_state" {
  bucket = aws_s3_bucket.aggregator_state.id

  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

# Only saved plans are temporary. All state/demo/publication state history
# and OpenTofu lock files remain outside these lifecycle rules.
resource "aws_s3_bucket_lifecycle_configuration" "aggregator_demo_plans" {
  bucket = aws_s3_bucket.aggregator_state.id

  rule {
    id     = "ExpireDemoSavedPlansAfter7Days"
    status = "Enabled"

    filter {
      prefix = "plans/demo/"
    }

    expiration {
      days = 7
    }

    noncurrent_version_expiration {
      noncurrent_days = 1
    }

    abort_incomplete_multipart_upload {
      days_after_initiation = 7
    }
  }

  rule {
    id     = "RemoveExpiredDemoPlanDeleteMarkers"
    status = "Enabled"

    filter {
      prefix = "plans/demo/"
    }

    expiration {
      expired_object_delete_marker = true
    }
  }

  depends_on = [aws_s3_bucket_versioning.aggregator_state]
}

data "aws_iam_policy_document" "aggregator_state_bucket" {
  statement {
    sid     = "DenyInsecureTransport"
    effect  = "Deny"
    actions = ["s3:*"]
    resources = [
      aws_s3_bucket.aggregator_state.arn,
      "${aws_s3_bucket.aggregator_state.arn}/*",
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

  # Require conditional, write-once uploads only in the temporary-plan area.
  statement {
    sid       = "DenyNonConditionalDemoPlanWrites"
    effect    = "Deny"
    actions   = ["s3:PutObject"]
    resources = ["${aws_s3_bucket.aggregator_state.arn}/plans/demo/*"]

    principals {
      type        = "*"
      identifiers = ["*"]
    }

    condition {
      test     = "Null"
      variable = "s3:if-none-match"
      values   = ["true"]
    }

    condition {
      test     = "Bool"
      variable = "s3:ObjectCreationOperation"
      values   = ["true"]
    }
  }
}

resource "aws_s3_bucket_policy" "aggregator_state" {
  bucket = aws_s3_bucket.aggregator_state.id
  policy = data.aws_iam_policy_document.aggregator_state_bucket.json

  depends_on = [aws_s3_bucket_public_access_block.aggregator_state]
}
