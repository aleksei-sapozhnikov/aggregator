terraform {
  backend "s3" {
    bucket       = "aggregator-tofu-state-905418096305-eu-central-1"
    key          = "publication/tofu.tfstate"
    region       = "eu-central-1"
    encrypt      = true
    use_lockfile = true
  }
}
