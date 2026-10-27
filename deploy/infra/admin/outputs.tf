# Shared administrative resources and deployment identity.

output "github_demo_deploy_role_arn" {
  description = "Use as AWS_DEMO_DEPLOY_ROLE_ARN in GitHub demo environment."
  value       = aws_iam_role.github_demo_deploy.arn
}

output "github_demo_infra_plan_role_arn" {
  description = "Set as AWS_DEMO_INFRA_PLAN_ROLE_ARN in GitHub repository variables."
  value       = aws_iam_role.github_demo_infra_plan.arn
}

output "github_demo_infra_apply_role_arn" {
  description = "Set as AWS_DEMO_INFRA_APPLY_ROLE_ARN in GitHub repository variables."
  value       = aws_iam_role.github_demo_infra_apply.arn
}
