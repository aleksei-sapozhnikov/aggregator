# Project workloads use their own S3 state bucket only.
locals {
  state_bucket_arn = "arn:aws:s3:::aggregator-project-tofu-state-905418096305-eu-central-1"
}
