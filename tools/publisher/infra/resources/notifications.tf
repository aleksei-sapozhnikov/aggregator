# Store the notification destination separately from the Terraform source.
# The secret value is set through AWS Secrets Manager, not by Terraform.
resource "aws_secretsmanager_secret" "notification_email" {
  name        = "${local.prefix}-notification-email"
  description = "Email destination for Aggregator Publisher failure alerts delivered through Amazon SNS."

  tags = {
    Name = "${local.prefix}-notification-email"
  }
}

# The initial secret version must be created outside Terraform before reading it.
# Reading secret_string will also record the destination in the encrypted state.
data "aws_secretsmanager_secret_version" "notification_email" {
  secret_id = aws_secretsmanager_secret.notification_email.id
}

# Import the existing confirmed subscription before applying this resource.
resource "aws_sns_topic_subscription" "failure_email" {
  topic_arn = aws_sns_topic.failure.arn
  protocol  = "email"
  endpoint  = trimspace(data.aws_secretsmanager_secret_version.notification_email.secret_string)
}
