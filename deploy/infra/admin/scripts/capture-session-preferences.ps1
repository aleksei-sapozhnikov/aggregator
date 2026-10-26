# Capture current regional Session Manager preferences before OpenTofu takes ownership.
# Run with AWS_PROFILE=infra-admin in the account that hosts the demo.

$ErrorActionPreference = "Stop"

$account = aws sts get-caller-identity --query Account --output text
if ($LASTEXITCODE -ne 0 -or $account -ne "905418096305") {
  throw "Expected AWS account 905418096305; check AWS_PROFILE."
}

$raw = aws ssm get-document `
  --region eu-central-1 `
  --name SSM-SessionManagerRunShell `
  --document-format JSON `
  --output json
if ($LASTEXITCODE -ne 0) {
  throw "Could not read SSM-SessionManagerRunShell."
}

$payload = ($raw | Out-String | ConvertFrom-Json).Content
$preferences = $payload | ConvertFrom-Json
if ($preferences.schemaVersion -ne "1.0" -or $preferences.sessionType -ne "Standard_Stream") {
  throw "Unexpected session document schema or session type."
}
if ($null -eq $preferences.inputs) {
  throw "Existing session preferences are missing inputs."
}

$preferences.inputs | Add-Member -NotePropertyName runAsEnabled -NotePropertyValue $true -Force
$preferences | Add-Member -NotePropertyName _capturedFromAWS -NotePropertyValue $true -Force

$output = Join-Path (Split-Path -Parent $PSScriptRoot) "session-manager-preferences.json"
$content = ($preferences | ConvertTo-Json -Depth 50) + "`n"
[System.IO.File]::WriteAllText($output, $content, (New-Object System.Text.UTF8Encoding($false)))

Write-Output "Captured current preferences to $output. Review logging, encryption, timeouts, and shell profiles before applying."
