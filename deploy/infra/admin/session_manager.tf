# Regional, account-wide preferences for interactive Session Manager sessions.

resource "aws_ssm_document" "session_manager_preferences" {
  name            = "SSM-SessionManagerRunShell"
  document_type   = "Session"
  document_format = "JSON"

  # Apply the scoped document permissions before updating the preferences.
  depends_on = [aws_iam_policy.infrastructure_admin_management]

  content = jsonencode({
    schemaVersion = "1.0"
    description   = "Document to hold regional settings for Session Manager"
    sessionType   = "Standard_Stream"
    inputs = {
      s3BucketName                = ""
      s3KeyPrefix                 = ""
      s3EncryptionEnabled         = true
      cloudWatchLogGroupName      = ""
      cloudWatchEncryptionEnabled = true
      cloudWatchStreamingEnabled  = true
      idleSessionTimeout          = "20"
      maxSessionDuration          = ""
      kmsKeyId                    = ""
      runAsDefaultUser            = ""
      shellProfile = {
        windows = ""
        linux   = ""
      }
      runAsEnabled = true
    }
  })
}
