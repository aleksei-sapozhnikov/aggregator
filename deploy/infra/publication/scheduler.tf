# Watchdog schedule, publication schedule group, and dead-letter queue.

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
