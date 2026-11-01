output "aggregator_state_bucket_name" {
  description = "Project-owned private S3 bucket for OpenTofu state and saved plans."
  value       = aws_s3_bucket.aggregator_state.id
}
