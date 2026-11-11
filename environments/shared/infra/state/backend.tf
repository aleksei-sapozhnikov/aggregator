# Existing project state bucket and key. AWS credentials are external.
terraform {
  backend "s3" {
    bucket       = "aggregator-project-tofu-state-905418096305-eu-central-1"
    key          = "state/tofu.tfstate"
    region       = "eu-central-1"
    encrypt      = true
    use_lockfile = true
  }
}
