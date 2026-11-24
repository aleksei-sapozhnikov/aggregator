output "publication_bucket" {
  description = "Name of the S3 bucket that stores publication plans and state snapshots."
  value       = aws_s3_bucket.data.bucket
}

output "state_table" {
  description = "Name of the DynamoDB table that stores publication state."
  value       = aws_dynamodb_table.state.name
}

output "runner_arn" {
  description = "ARN of the Publisher Lambda runner."
  value       = aws_lambda_function.runner.arn
}

output "watchdog_name" {
  description = "Name of the scheduled Publisher watchdog."
  value       = aws_scheduler_schedule.watchdog.name
}

output "failure_topic_arn" {
  description = "ARN of the SNS topic used for Publisher failure notifications."
  value       = aws_sns_topic.failure.arn
}
