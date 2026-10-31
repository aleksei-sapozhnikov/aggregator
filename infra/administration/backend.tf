# Project-specific IAM is operated by the central administrator.
# Before migration, retain the old backend through an explicit init override.
terraform {
  backend "s3" {
    bucket       = "aws-administration-state-905418096305-eu-central-1"
    key          = "projects/aggregator/tofu.tfstate"
    region       = "eu-central-1"
    encrypt      = true
    use_lockfile = true
  }
}
