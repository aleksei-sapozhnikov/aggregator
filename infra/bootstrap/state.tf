# Shared backend bucket is owned by aws_foundation/account.
# Keep the same bucket/ARN so project IAM policies and S3 state keys remain stable.
locals {
  state_bucket_arn = "arn:aws:s3:::aggregator-tofu-state-905418096305-eu-central-1"
}
