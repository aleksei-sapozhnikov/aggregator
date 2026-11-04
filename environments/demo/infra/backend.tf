# Remote state location and S3 lock-file configuration.

terraform {
  backend "s3" {
    bucket       = "aggregator-project-tofu-state-905418096305-eu-central-1"
    key          = "demo/tofu.tfstate"
    region       = "eu-central-1"
    encrypt      = true
    use_lockfile = true
  }
}
