# Region-wide Session Manager preferences move to aws_foundation/account.
# Keep the existing AWS document; only its OpenTofu state ownership changes.
removed {
  from = aws_ssm_document.session_manager_preferences

  lifecycle {
    destroy = false
  }
}
