# Shared lint policy for all Aggregator OpenTofu roots.
# Tags are enforced through provider defaults; GovCloud portability rules do not apply.
tflint {
  required_version = "= 0.65.0"
}

config {
  call_module_type = "local"
}

plugin "terraform" {
  enabled = true
  preset  = "all"
}

plugin "aws" {
  enabled    = true
  version    = "0.50.0"
  source     = "github.com/terraform-linters/tflint-ruleset-aws"
  deep_check = false
}

rule "aws_ephemeral_resources" {
  enabled = true
}

rule "aws_iam_policy_attachment_exclusive_attachment" {
  enabled = true
}

rule "aws_iam_role_deprecated_policy_attributes" {
  enabled = true
}

rule "aws_provider_missing_default_tags" {
  enabled = true
  tags    = ["Repository"]
}

rule "aws_security_group_inline_rules" {
  enabled = true
}

rule "aws_security_group_rule_deprecated" {
  enabled = true
}

rule "aws_write_only_arguments" {
  enabled = true
}
