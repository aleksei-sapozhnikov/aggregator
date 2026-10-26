provider "aws" {
  region              = "eu-central-1"
  allowed_account_ids = ["905418096305"]

  default_tags {
    tags = {
      Repository = "https://github.com/aleksei-sapozhnikov/aggregator"
    }
  }
}
