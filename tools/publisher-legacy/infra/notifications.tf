# Failure notifications, email subscription, logs, and CloudWatch alarms.

resource "aws_sns_topic" "failure" {
  name = local.failure_topic_name

  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_sns_topic_policy" "failure" {
  arn = aws_sns_topic.failure.arn

  # Restrict topic access to the owning AWS account.
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
