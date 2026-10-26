# AWS provider requirement inherited from the caller.

terraform {
  required_providers {
    aws = {
      source = "hashicorp/aws"
    }
  }
}
