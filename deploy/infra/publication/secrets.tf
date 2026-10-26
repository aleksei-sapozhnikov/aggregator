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

# SNS requires the endpoint as an argument. This data source keeps the address
# out of source files, but the provider will persist it in the encrypted state
# and any saved plan that manages the subscription.
# Look up by the stable secret name so the data source can resolve while the
# secret itself is being imported in the same plan.
data "aws_secretsmanager_secret_version" "notification_email" {
  secret_id     = "aggregator-publication-notification-email"
  version_stage = "AWSCURRENT"
}

# Keep token reads in a separate, narrowly named inline policy so the function
# can access only the two credential secrets.
resource "aws_iam_role_policy" "function_secret_read" {
  name = "PublicationSecretRead"
  role = "aggregator-publication-FunctionRole-UMrD5Cv9Prk0"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid    = "ReadPublicationTokenSecrets"
      Effect = "Allow"
      Action = ["secretsmanager:GetSecretValue"]
      Resource = [
        aws_secretsmanager_secret.github_token.arn,
        aws_secretsmanager_secret.project_token.arn,
      ]
    }]
  })

  lifecycle {
    prevent_destroy = true
  }
}

output "github_token_secret_arn" {
  description = "Secrets Manager ARN read by the publication Lambda for GitHub API access"
  value       = aws_secretsmanager_secret.github_token.arn
}

output "project_token_secret_arn" {
  description = "Secrets Manager ARN read by the publication Lambda for GitHub Projects access"
  value       = aws_secretsmanager_secret.project_token.arn
}
