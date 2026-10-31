# Shared backend bucket is owned by aws_foundation/account.
# Keep the same bucket/ARN so project IAM policies and S3 state keys remain stable.
locals {
  state_bucket_arn = "arn:aws:s3:::aggregator-tofu-state-905418096305-eu-central-1"
}

# Forget the existing objects in this state without changing them in AWS.
removed {
  from = aws_s3_bucket.tofu_state

  lifecycle {
    destroy = false
  }
}

removed {
  from = aws_s3_bucket_ownership_controls.tofu_state

  lifecycle {
    destroy = false
  }
}

removed {
  from = aws_s3_bucket_policy.tofu_state

  lifecycle {
    destroy = false
  }
}

removed {
  from = aws_s3_bucket_public_access_block.tofu_state

  lifecycle {
    destroy = false
  }
}

removed {
  from = aws_s3_bucket_server_side_encryption_configuration.tofu_state

  lifecycle {
    destroy = false
  }
}

removed {
  from = aws_s3_bucket_versioning.tofu_state

  lifecycle {
    destroy = false
  }
}
