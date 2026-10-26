# Resource identifiers for publication operators and local tools.

output "publication_function_name" {
  description = "Stable name of the publication Lambda function"
  value       = aws_lambda_function.runner.function_name
}

output "publication_function_arn" {
  description = "ARN of the publication Lambda function"
  value       = aws_lambda_function.runner.arn
}

output "publication_bucket_name" {
  description = "Name of the versioned publication snapshot bucket"
  value       = aws_s3_bucket.publication.bucket
}

output "publication_bucket_arn" {
  description = "ARN of the publication snapshot bucket"
  value       = aws_s3_bucket.publication.arn
}

output "publication_state_table_name" {
  description = "Name of the publication DynamoDB state and queue table"
  value       = aws_dynamodb_table.state.name
}

output "publication_state_table_arn" {
  description = "ARN of the publication DynamoDB state and queue table"
  value       = aws_dynamodb_table.state.arn
}

output "publication_schedule_group_name" {
  description = "EventBridge Scheduler group used for the watchdog and dynamic queue schedules"
  value       = aws_scheduler_schedule_group.publication.name
}

output "publication_watchdog_schedule_arn" {
  description = "ARN of the recurring publication watchdog schedule"
  value       = aws_scheduler_schedule.watchdog.arn
}

output "publication_watchdog_schedule_name" {
  description = "Name of the recurring publication watchdog schedule"
  value       = aws_scheduler_schedule.watchdog.name
}

output "publication_scheduler_role_arn" {
  description = "ARN of the EventBridge Scheduler execution role"
  value       = aws_iam_role.scheduler.arn
}

output "publication_scheduler_dlq_url" {
  description = "URL of the Scheduler dead-letter queue"
  value       = aws_sqs_queue.scheduler_dlq.url
}

output "publication_scheduler_dlq_arn" {
  description = "ARN of the Scheduler dead-letter queue"
  value       = aws_sqs_queue.scheduler_dlq.arn
}

output "publication_failure_topic_arn" {
  description = "SNS topic ARN for publication and alarm notifications"
  value       = aws_sns_topic.failure.arn
}

output "publication_log_group_name" {
  description = "CloudWatch log group used by the publication Lambda"
  value       = aws_cloudwatch_log_group.publication.name
}

output "github_token_secret_arn" {
  description = "Secrets Manager ARN read by the publication Lambda for GitHub API access"
  value       = aws_secretsmanager_secret.github_token.arn
}

output "project_token_secret_arn" {
  description = "Secrets Manager ARN read by the publication Lambda for GitHub Projects access"
  value       = aws_secretsmanager_secret.project_token.arn
}
