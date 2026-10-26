# Shared administrative resources and deployment identity.

output "github_demo_deploy_role_arn" {
  description = "Use as AWS_DEMO_DEPLOY_ROLE_ARN in GitHub demo environment."
  value       = aws_iam_role.github_demo_deploy.arn
}
