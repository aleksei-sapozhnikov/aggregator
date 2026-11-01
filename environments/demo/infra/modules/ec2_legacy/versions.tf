# AWS provider requirement inherited from the caller.

terraform {
  required_version = ">= 1.12.0, < 2.0.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = ">= 6.41.0, < 7.0.0"
    }
  }
}
