# Shared administrative resources and deployment identity.

output "github_demo_infra_plan_role_arn" {
  description = "Set as AWS_ROLE_ARN in the demo-infra-plan GitHub Environment."
  value       = aws_iam_role.github_demo_infra_plan.arn
}

output "github_demo_infra_apply_role_arn" {
  description = "Set as AWS_ROLE_ARN in the demo-infra-apply GitHub Environment."
  value       = aws_iam_role.github_demo_infra_apply.arn
}
