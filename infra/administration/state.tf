# The project admin controls workload state in its own bucket.
# The legacy ARN is retained temporarily for non-disruptive backend migration.
locals {
  state_bucket_arn        = "arn:aws:s3:::aggregator-project-tofu-state-905418096305-eu-central-1"
  legacy_state_bucket_arn = "arn:aws:s3:::aggregator-tofu-state-905418096305-eu-central-1"
  migration_state_buckets = [local.state_bucket_arn, local.legacy_state_bucket_arn]
}
