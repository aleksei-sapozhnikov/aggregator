# Secret containers and the SNS email endpoint lookup; token values are set separately.

resource "aws_secretsmanager_secret" "github_token" {
  name                    = "aggregator-publication-github-token"
  description             = "GitHub repository token used by the publication runner"
  recovery_window_in_days = 30

  tags = {
    Name      = "aggregator-publication-github-token"
    Purpose   = "publication-credential"
    Project   = "aggregator"
    Component = "publication"
    ManagedBy = "opentofu"
  }

  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_secretsmanager_secret" "project_token" {
  name                    = "aggregator-publication-project-token"
  description             = "GitHub Projects token used by the publication runner"
  recovery_window_in_days = 30

  tags = {
    Name      = "aggregator-publication-project-token"
    Purpose   = "publication-credential"
    Project   = "aggregator"
    Component = "publication"
    ManagedBy = "opentofu"
  }

  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_secretsmanager_secret" "notification_email" {
  name                    = "aggregator-publication-notification-email"
  description             = "Email endpoint for publication failure notifications"
  recovery_window_in_days = 30

  tags = {
    Name      = "aggregator-publication-notification-email"
    Purpose   = "publication-notification-endpoint"
    Project   = "aggregator"
    Component = "publication"
    ManagedBy = "opentofu"
  }

  lifecycle {
    prevent_destroy = true
  }
}

# SNS persists the email endpoint in state and saved plans.
data "aws_secretsmanager_secret_version" "notification_email" {
  secret_id     = "aggregator-publication-notification-email"
  version_stage = "AWSCURRENT"
}
