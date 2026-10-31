# Shared administrative resources and deployment identity.

output "github_demo_deploy_role_arn" {
  description = "Use as AWS_DEMO_DEPLOY_ROLE_ARN in GitHub demo environment."
  value       = aws_iam_role.github_demo_deploy.arn
}

output "github_demo_infra_plan_role_arn" {
  description = "Set as AWS_ROLE_ARN in the demo-infra-plan GitHub Environment."
  value       = aws_iam_role.github_demo_infra_plan.arn
}

output "github_demo_infra_apply_role_arn" {
  description = "Set as AWS_ROLE_ARN in the demo-infra-apply GitHub Environment."
  value       = aws_iam_role.github_demo_infra_apply.arn
}

output "aggregator_state_bucket_name" {
  description = "Aggregator-owned private bucket for project OpenTofu state and saved plans."
  value       = aws_s3_bucket.aggregator_state.id
}
