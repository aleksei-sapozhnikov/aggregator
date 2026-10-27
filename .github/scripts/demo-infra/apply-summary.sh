#!/usr/bin/env bash
# Summarize the current demo infrastructure outputs after a successful apply.
# Highlights public EC2 addresses and instance IDs, then lists all root outputs
# in a collapsed GitHub Actions summary. Sensitive outputs remain redacted.
# Run from deploy/infra/demo; requires GITHUB_STEP_SUMMARY and TERRAFORM_CHANGED.

set -euo pipefail

# JSON is used only to extract explicitly allowlisted non-sensitive values.
# Never print JSON or use -raw for the complete state: both reveal secrets.
outputs_json="$(tofu output -json)"

public_output() {
  local name="$1"
  jq -r --arg name "$name" '
    .[$name] // empty
    | select(.sensitive == false)
    | .value
    | select(. != null and (type == "string" or type == "number"))
    | tostring
  ' <<< "$outputs_json"
}

k3s_ip="$(public_output k3s_public_ip)"
k3s_instance="$(public_output k3s_instance_id)"
legacy_ip="$(public_output elastic_ip_address)"
legacy_instance="$(public_output instance_id)"

# The human-readable form automatically redacts sensitive output values.
outputs_text="$(tofu output -no-color)"

{
  echo "## Demo infrastructure - current outputs"
  echo
  if [[ "${TERRAFORM_CHANGED:-false}" == true ]]; then
    echo "The approved OpenTofu plan was applied successfully."
  else
    echo "No Terraform changes were required. Values below reflect the current state."
  fi
  echo
  echo "### Connection details"
  echo
  if [[ -n "$k3s_ip" ]]; then
    echo "- **K3s public IP:** `$k3s_ip`"
    echo "- **K3s HTTP address:** `http://$k3s_ip/` (available after application deployment)"
  else
    echo "- **K3s public IP:** Not provisioned or not available."
  fi
  if [[ -n "$k3s_instance" ]]; then
    echo "- **K3s EC2 instance:** `$k3s_instance`"
  fi
  if [[ -n "$legacy_ip" ]]; then
    echo "- **Existing demo Elastic IP:** `$legacy_ip`"
  fi
  if [[ -n "$legacy_instance" ]]; then
    echo "- **Existing demo EC2 instance:** `$legacy_instance`"
  fi
  echo
  echo "<details>"
  echo "<summary>All OpenTofu outputs (expand to inspect)</summary>"
  echo
  echo '```text'
  if [[ -n "$outputs_text" ]]; then
    printf "%s\n" "$outputs_text"
  else
    echo "No root outputs are defined in the current state."
  fi
  echo '```'
  echo
  echo "</details>"
} >> "$GITHUB_STEP_SUMMARY"
