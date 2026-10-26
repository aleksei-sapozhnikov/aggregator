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

  # CloudFormation's deployed template points at the SAM source object. The
  # operator's release script updates only Lambda code and checks its hash.
  # Keep this source location as create-time metadata and ignore code changes
  # so infrastructure plans cannot silently roll back a code-only release.
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
      NOTIFICATIONS_ENABLED = "false"
      ACTIVATION_ENABLED    = "false"
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

resource "aws_iam_role" "function" {
  name                 = local.function_role
  path                 = "/"
  permissions_boundary = local.role_boundary_arn
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Principal = {
        Service = "lambda.amazonaws.com"
      }
      Action = "sts:AssumeRole"
    }]
  })

  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_iam_role_policy" "function_runner" {
  name = "Runner"
  role = aws_iam_role.function.name
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["logs:CreateLogStream", "logs:PutLogEvents"]
        Resource = "${aws_cloudwatch_log_group.publication.arn}:*"
      },
      {
        Effect   = "Allow"
        Action   = ["dynamodb:GetItem", "dynamodb:PutItem", "dynamodb:UpdateItem"]
        Resource = aws_dynamodb_table.state.arn
      },
      {
        Effect   = "Allow"
        Action   = ["s3:GetObject"]
        Resource = "${aws_s3_bucket.publication.arn}/snapshots/*"
      },
      {
        Effect   = "Allow"
        Action   = ["sns:Publish"]
        Resource = aws_sns_topic.failure.arn
      },
    ]
  })

  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_iam_role" "scheduler" {
  name                 = local.scheduler_role
  path                 = "/"
  permissions_boundary = local.role_boundary_arn
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Principal = {
        Service = "scheduler.amazonaws.com"
      }
      Action = "sts:AssumeRole"
    }]
  })

  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_iam_role_policy" "scheduler_invoke_and_dlq" {
  name = "InvokeAndDlq"
  role = aws_iam_role.scheduler.name
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["lambda:InvokeFunction"]
        Resource = aws_lambda_function.runner.arn
      },
      {
        Effect   = "Allow"
        Action   = ["sqs:SendMessage"]
        Resource = aws_sqs_queue.scheduler_dlq.arn
      },
    ]
  })

  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_dynamodb_table" "state" {
  name         = local.table_name
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "pk"

  attribute {
    name = "pk"
    type = "S"
  }

  point_in_time_recovery {
    enabled                 = true
    recovery_period_in_days = 35
  }

  deletion_protection_enabled = false

  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_s3_bucket" "publication" {
  bucket = local.bucket_name

  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_s3_bucket_versioning" "publication" {
  bucket = aws_s3_bucket.publication.id

  versioning_configuration {
    status = "Enabled"
  }

  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "publication" {
  bucket = aws_s3_bucket.publication.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }

  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_s3_bucket_public_access_block" "publication" {
  bucket                  = aws_s3_bucket.publication.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true

  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_s3_bucket_ownership_controls" "publication" {
  bucket = aws_s3_bucket.publication.id

  rule {
    object_ownership = "BucketOwnerEnforced"
  }

  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_scheduler_schedule_group" "publication" {
  name = local.schedule_group

  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_scheduler_schedule" "watchdog" {
  name                         = local.watchdog_name
  group_name                   = aws_scheduler_schedule_group.publication.name
  schedule_expression          = "rate(15 minutes)"
  schedule_expression_timezone = "UTC"
  state                        = "ENABLED"

  flexible_time_window {
    mode = "OFF"
  }

  target {
    arn      = aws_lambda_function.runner.arn
    role_arn = aws_iam_role.scheduler.arn
    input    = "{\"reconcile\":true}"

    dead_letter_config {
      arn = aws_sqs_queue.scheduler_dlq.arn
    }

    retry_policy {
      maximum_event_age_in_seconds = 86400
      maximum_retry_attempts       = 185
    }
  }

  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_sqs_queue" "scheduler_dlq" {
  name                       = local.scheduler_dlq_name
  message_retention_seconds  = 1209600
  visibility_timeout_seconds = 30
  max_message_size           = 1048576
  delay_seconds              = 0
  receive_wait_time_seconds  = 0
  sqs_managed_sse_enabled    = true

  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_sns_topic" "failure" {
  name = local.failure_topic_name

  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_sns_topic_policy" "failure" {
  arn = aws_sns_topic.failure.arn

  # Preserve the observed AWS default owner-account policy exactly. This keeps
  # topic administration within the owning account and allows the existing
  # confirmed email subscription and alarm publishers to continue working.
  policy = jsonencode({
    Version = "2008-10-17"
    Id      = "__default_policy_ID"
    Statement = [{
      Sid    = "__default_statement_ID"
      Effect = "Allow"
      Principal = {
        AWS = "*"
      }
      Action = [
        "SNS:GetTopicAttributes",
        "SNS:SetTopicAttributes",
        "SNS:AddPermission",
        "SNS:RemovePermission",
        "SNS:DeleteTopic",
        "SNS:Subscribe",
        "SNS:ListSubscriptionsByTopic",
        "SNS:Publish",
      ]
      Resource = aws_sns_topic.failure.arn
      Condition = {
        StringEquals = {
          "AWS:SourceOwner" = "905418096305"
        }
      }
    }]
  })

  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_sns_topic_subscription" "failure_email" {
  topic_arn = aws_sns_topic.failure.arn
  protocol  = "email"
  endpoint  = data.aws_secretsmanager_secret_version.notification_email.secret_string

  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_cloudwatch_log_group" "publication" {
  name              = local.log_group_name
  retention_in_days = 30

  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_cloudwatch_metric_alarm" "lambda_errors" {
  alarm_name          = "${local.publication_prefix}-lambda-errors"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "Errors"
  namespace           = "AWS/Lambda"
  period              = 300
  statistic           = "Sum"
  threshold           = 0
  treat_missing_data  = "notBreaching"
  actions_enabled     = true
  alarm_actions       = [aws_sns_topic.failure.arn]
  dimensions = {
    FunctionName = aws_lambda_function.runner.function_name
  }

  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_cloudwatch_metric_alarm" "scheduler_dlq_visible" {
  alarm_name          = "${local.publication_prefix}-scheduler-dlq-visible"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "ApproximateNumberOfMessagesVisible"
  namespace           = "AWS/SQS"
  period              = 300
  statistic           = "Maximum"
  threshold           = 0
  treat_missing_data  = "notBreaching"
  actions_enabled     = true
  alarm_actions       = [aws_sns_topic.failure.arn]
  dimensions = {
    QueueName = aws_sqs_queue.scheduler_dlq.name
  }

  lifecycle {
    prevent_destroy = true
  }
}
