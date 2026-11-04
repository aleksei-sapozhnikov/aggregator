output "publisher_role_boundary_arn" {
  description = "ARN of the Publisher Lambda and Scheduler permissions boundary."
  value       = aws_iam_policy.publisher_role_boundary.arn
}
