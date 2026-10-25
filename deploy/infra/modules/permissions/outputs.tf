output "bedrock_policy_arn" {
  description = "Shared managed policy ARN for the Bedrock inference profile."
  value       = aws_iam_policy.bedrock.arn
}
