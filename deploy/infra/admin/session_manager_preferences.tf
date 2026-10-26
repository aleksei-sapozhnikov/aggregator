# Account- and region-wide Session Manager shell preferences.
# Capture the existing document before planning this resource.

locals {
  session_manager_preferences_snapshot = jsondecode(file("${path.module}/session-manager-preferences.json"))
}

resource "aws_ssm_document" "session_manager_preferences" {
  name            = "SSM-SessionManagerRunShell"
  document_type   = "Session"
  document_format = "JSON"

  # Apply the narrow DeleteDocument permission before replacing schema 1.0.
  depends_on = [aws_iam_policy.infrastructure_admin_management]

  content = jsonencode(merge(
    {
      for key, value in local.session_manager_preferences_snapshot :
      key => value if key != "_capturedFromAWS"
    },
    {
      inputs = merge(local.session_manager_preferences_snapshot.inputs, {
        runAsEnabled = true
      })
    }
  ))

  lifecycle {
    precondition {
      condition     = try(local.session_manager_preferences_snapshot._capturedFromAWS, false) == true
      error_message = "Capture the actual current SSM session preferences first: run scripts/capture-session-preferences.ps1."
    }
  }
}
