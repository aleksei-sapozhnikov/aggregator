terraform {
  required_version = ">= 1.12.0, < 2.0.0"
  required_providers {
    aws = { source = "hashicorp/aws", version = "~> 6.41.0" }
  }
  backend "s3" {
    bucket       = "aggregator-project-tofu-state-905418096305-eu-central-1"
    key          = "aggregator-publisher/tofu.tfstate"
    region       = "eu-central-1"
    encrypt      = true
    use_lockfile = true
  }
}

provider "aws" {
  region              = "eu-central-1"
  allowed_account_ids = ["905418096305"]

  default_tags {
    tags = {
      Repository = "https://github.com/aleksei-sapozhnikov/aggregator"
    }
  }
}

locals {
  prefix     = "aggregator-publisher"
  bucket     = "${local.prefix}-data-905418096305-eu-central-1"
  not_before = "2026-11-10T08:00:00Z"
}

resource "aws_s3_bucket" "data" {
  bucket = local.bucket
}
resource "aws_s3_bucket_versioning" "data" {
  bucket = aws_s3_bucket.data.id
  versioning_configuration {
    status = "Enabled"
  }
}
resource "aws_s3_bucket_server_side_encryption_configuration" "data" {
  bucket = aws_s3_bucket.data.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}
resource "aws_s3_bucket_public_access_block" "data" {
  bucket                  = aws_s3_bucket.data.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_dynamodb_table" "state" {
  name         = "${local.prefix}-state"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "pk"
  attribute {
    name = "pk"
    type = "S"
  }
  point_in_time_recovery {
    enabled = true
  }
}

resource "aws_secretsmanager_secret" "repository" {
  name        = "${local.prefix}-github-token"
  description = "GitHub repository token used by Aggregator Publisher to manage pull requests, version tags, and releases."
  tags        = { Name = "${local.prefix}-github-token" }
  # Temporary: prevent default Repository tag drift during legacy retirement.
  # Remove after the operator grants secretsmanager:TagResource.
  lifecycle {
    ignore_changes = [tags_all]
  }
}
resource "aws_secretsmanager_secret" "project" {
  name        = "${local.prefix}-project-token"
  description = "GitHub Projects token used by Aggregator Publisher to update publication project items."
  tags        = { Name = "${local.prefix}-project-token" }
  # Temporary: prevent default Repository tag drift during legacy retirement.
  # Remove after the operator grants secretsmanager:TagResource.
  lifecycle {
    ignore_changes = [tags_all]
  }
}
resource "aws_cloudwatch_log_group" "runner" {
  name              = "/aws/lambda/${local.prefix}-runner"
  retention_in_days = 30
}
resource "aws_sns_topic" "failure" {
  name = "${local.prefix}-failure"
}

resource "aws_sqs_queue" "dlq" {
  name                      = "${local.prefix}-scheduler-dlq"
  message_retention_seconds = 1209600
  sqs_managed_sse_enabled   = true
}

resource "aws_iam_role" "runner" {
  name                 = "${local.prefix}-function-role"
  permissions_boundary = var.permission_boundary_arn
  assume_role_policy   = jsonencode({ Version = "2012-10-17", Statement = [{ Effect = "Allow", Principal = { Service = "lambda.amazonaws.com" }, Action = "sts:AssumeRole" }] })
}
resource "aws_iam_role_policy" "runner" {
  name = "Publisher"
  role = aws_iam_role.runner.name
  policy = jsonencode({ Version = "2012-10-17", Statement = [
    { Effect = "Allow", Action = ["logs:CreateLogStream", "logs:PutLogEvents"], Resource = "${aws_cloudwatch_log_group.runner.arn}:*" },
    { Effect = "Allow", Action = ["dynamodb:GetItem", "dynamodb:PutItem", "dynamodb:UpdateItem"], Resource = aws_dynamodb_table.state.arn },
    { Effect = "Allow", Action = ["s3:GetObject"], Resource = "${aws_s3_bucket.data.arn}/snapshots/*" },
    { Effect = "Allow", Action = ["secretsmanager:GetSecretValue"], Resource = [aws_secretsmanager_secret.repository.arn, aws_secretsmanager_secret.project.arn] },
    { Effect = "Allow", Action = ["sns:Publish"], Resource = aws_sns_topic.failure.arn }
  ] })
}
resource "aws_lambda_function" "runner" {
  function_name    = "${local.prefix}-runner"
  filename         = "${path.module}/../../build/publisher.zip"
  source_code_hash = filebase64sha256("${path.module}/../../build/publisher.zip")
  handler          = "publisher_runtime.handler.lambda_handler"
  runtime          = "python3.12"
  role             = aws_iam_role.runner.arn
  memory_size      = 256
  timeout          = 840
  environment {
    variables = {
      PUBLICATION_BUCKET    = aws_s3_bucket.data.bucket
      STATE_TABLE           = aws_dynamodb_table.state.name
      GITHUB_SECRET_ARN     = aws_secretsmanager_secret.repository.arn
      PROJECT_SECRET_ARN    = aws_secretsmanager_secret.project.arn
      ACTIVATION_ENABLED    = "true"
      NOTIFICATIONS_ENABLED = "true"
      SNS_TOPIC_ARN         = aws_sns_topic.failure.arn
      NOT_BEFORE_UTC        = local.not_before
    }
  }
  depends_on = [aws_cloudwatch_log_group.runner, aws_iam_role_policy.runner]
}
resource "aws_iam_role" "scheduler" {
  name                 = "${local.prefix}-scheduler-role"
  permissions_boundary = var.permission_boundary_arn
  assume_role_policy   = jsonencode({ Version = "2012-10-17", Statement = [{ Effect = "Allow", Principal = { Service = "scheduler.amazonaws.com" }, Action = "sts:AssumeRole" }] })
}
resource "aws_iam_role_policy" "scheduler" {
  name = "PublisherInvoke"
  role = aws_iam_role.scheduler.name
  policy = jsonencode({ Version = "2012-10-17", Statement = [
    { Effect = "Allow", Action = ["lambda:InvokeFunction"], Resource = aws_lambda_function.runner.arn },
    { Effect = "Allow", Action = ["sqs:SendMessage"], Resource = aws_sqs_queue.dlq.arn }
  ] })
}
resource "aws_scheduler_schedule_group" "publication" {
  name = "${local.prefix}-group"
}
resource "aws_scheduler_schedule" "watchdog" {
  name                = "${local.prefix}-watchdog"
  group_name          = aws_scheduler_schedule_group.publication.name
  schedule_expression = "rate(15 minutes)"
  start_date          = local.not_before
  state               = "ENABLED"
  flexible_time_window {
    mode = "OFF"
  }
  target {
    arn      = aws_lambda_function.runner.arn
    role_arn = aws_iam_role.scheduler.arn
    input    = jsonencode({ reconcile = true })
    dead_letter_config {
      arn = aws_sqs_queue.dlq.arn
    }
    retry_policy {
      maximum_event_age_in_seconds = 86400
      maximum_retry_attempts       = 3
    }
  }
  depends_on = [aws_iam_role_policy.scheduler]
}
