# Separate privileged IAM state; this root does not manage workload resources.
terraform {
  required_version = ">= 1.12.0, < 2.0.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.41.0"
    }
  }

  backend "s3" {
    bucket       = "aws-administration-state-905418096305-eu-central-1"
    key          = "projects/aggregator/publisher/tofu.tfstate"
    region       = "eu-central-1"
    encrypt      = true
    use_lockfile = true
  }
}
