# This bucket is created while the admin state still uses its local backend.
# Move backend configuration only after the bucket and access policy exist.
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

  # ReadOnlyAccess includes broad S3 read permissions.
  # This deny prevents the delegated user from reading admin state.
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

data "aws_iam_policy_document" "demo_state_access" {
  statement {
    sid       = "ListDemoStateOnly"
    effect    = "Allow"
    actions   = ["s3:ListBucket"]
    resources = [aws_s3_bucket.tofu_state.arn]

    condition {
      test     = "StringLike"
      variable = "s3:prefix"
      values   = ["demo/*"]
    }
  }

  statement {
    sid     = "ReadWriteDemoState"
    effect  = "Allow"
    actions = ["s3:GetObject", "s3:PutObject"]
    resources = [
      "${aws_s3_bucket.tofu_state.arn}/demo/tofu.tfstate",
    ]
  }

  statement {
    sid     = "ManageDemoStateLock"
    effect  = "Allow"
    actions = ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"]
    resources = [
      "${aws_s3_bucket.tofu_state.arn}/demo/tofu.tfstate.tflock",
    ]
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

resource "aws_iam_group_policy_attachment" "demo_state_access" {
  group      = aws_iam_group.demo.name
  policy_arn = aws_iam_policy.demo_state_access.arn
}
