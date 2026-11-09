# Store the notification destination separately from the Terraform source.
# The secret value is set through AWS Secrets Manager, not by Terraform.
resource "aws_secretsmanager_secret" "notification_email" {
  name        = "${local.prefix}-notification-email"
  description = "Email destination for Aggregator Publisher failure alerts delivered through Amazon SNS."

  tags = {
    Name = "${local.prefix}-notification-email"
  }
}

# Read the secret version by its stable name, independently of the managed
# secret metadata resource so tag updates do not defer resolution of the SNS
# endpoint and trigger a subscription replacement.
# The endpoint is a persistent resource argument and is stored in encrypted
# OpenTofu state; ephemeral values cannot populate it.
# tflint-ignore: aws_ephemeral_resources
data "aws_secretsmanager_secret_version" "notification_email" {
  secret_id = "${local.prefix}-notification-email"
}

# Import the existing confirmed subscription before applying this resource.
resource "aws_sns_topic_subscription" "failure_email" {
  topic_arn = aws_sns_topic.failure.arn
  protocol  = "email"
  endpoint  = trimspace(data.aws_secretsmanager_secret_version.notification_email.secret_string)
}
