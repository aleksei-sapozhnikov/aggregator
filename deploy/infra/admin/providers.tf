# AWS account, region, and default resource tags.

provider "aws" {
  region              = "eu-central-1"
  allowed_account_ids = ["905418096305"]

  default_tags {
    tags = {
      Repository = "https://github.com/aleksei-sapozhnikov/aggregator"
    }
  }
}

# Session Manager preferences are an account-level document without resource tags.
# Keep this provider free of default_tags so updates do not require SSM tagging.
provider "aws" {
  alias               = "session_preferences"
  region              = "eu-central-1"
  allowed_account_ids = ["905418096305"]
}
