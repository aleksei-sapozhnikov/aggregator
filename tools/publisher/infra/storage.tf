# DynamoDB queue state and versioned S3 publication snapshots.

resource "aws_dynamodb_table" "state" {
  name         = local.table_name
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "pk"

  attribute {
    name = "pk"
    type = "S"
  }

  point_in_time_recovery {
    enabled                 = true
    recovery_period_in_days = 35
  }

  deletion_protection_enabled = false

  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_s3_bucket" "publication" {
  bucket = local.bucket_name

  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_s3_bucket_versioning" "publication" {
  bucket = aws_s3_bucket.publication.id

  versioning_configuration {
    status = "Enabled"
  }

  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "publication" {
  bucket = aws_s3_bucket.publication.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }

  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_s3_bucket_public_access_block" "publication" {
  bucket                  = aws_s3_bucket.publication.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true

  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_s3_bucket_ownership_controls" "publication" {
  bucket = aws_s3_bucket.publication.id

  rule {
    object_ownership = "BucketOwnerEnforced"
  }

  lifecycle {
    prevent_destroy = true
  }
}
