# Publication resource names and Lambda runtime configuration.

locals {
  publication_prefix = "aggregator-publication"
  function_name      = "${local.publication_prefix}-runner"
  bucket_name        = "aggregator-publication-data-905418096305-eu-central-1"
  table_name         = "${local.publication_prefix}-state"
  schedule_group     = "${local.publication_prefix}-group"
  watchdog_name      = "${local.publication_prefix}-watchdog"
  scheduler_role     = "aggregator-publication-SchedulerRole-7X0C8b4I4r8Z"
  function_role      = "aggregator-publication-FunctionRole-UMrD5Cv9Prk0"
  scheduler_dlq_name = "${local.publication_prefix}-scheduler-dlq"
  failure_topic_name = "${local.publication_prefix}-failure"
  log_group_name     = "/aws/lambda/${local.function_name}"
  role_boundary_arn  = "arn:aws:iam::905418096305:policy/AggregatorPublicationRoleBoundary"
}

resource "aws_lambda_function" "runner" {
  function_name = local.function_name
  role          = aws_iam_role.function.arn
  runtime       = "python3.12"
  handler       = "github_publication_runner.handler.lambda_handler"
  package_type  = "Zip"
  memory_size   = 256
  timeout       = 840

  # Bootstrap code source; ignore_changes preserves releases made by the code deployer.
  s3_bucket = "aws-sam-cli-managed-default-samclisourcebucket-8meyj1gfex9u"
  s3_key    = "aggregator-publication/8cd69bc62a4a1742911bdf3ea9252e66"

  architectures = ["x86_64"]

  ephemeral_storage {
    size = 512
  }

  environment {
    variables = {
      PUBLICATION_BUCKET    = aws_s3_bucket.publication.bucket
      STATE_TABLE           = aws_dynamodb_table.state.name
      GITHUB_SECRET_ARN     = aws_secretsmanager_secret.github_token.arn
      PROJECT_SECRET_ARN    = aws_secretsmanager_secret.project_token.arn
      SNS_TOPIC_ARN         = aws_sns_topic.failure.arn
      NOTIFICATIONS_ENABLED = "true"
      ACTIVATION_ENABLED    = "true"
    }
  }

  tags = {
    "lambda:createdBy" = "SAM"
  }

  lifecycle {
    prevent_destroy = true
    ignore_changes = [
      s3_bucket,
      s3_key,
      s3_object_version,
    ]
  }
}
