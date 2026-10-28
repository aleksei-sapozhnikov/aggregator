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
    printf -- '- **K3s public IP:** `%s`\n' "$k3s_ip"
    printf -- '- **K3s HTTP address:** `http://%s/` (available after application deployment)\n' "$k3s_ip"
  else
    echo "- **K3s public IP:** Not provisioned or not available."
  fi
  if [[ -n "$k3s_instance" ]]; then
    printf -- '- **K3s EC2 instance:** `%s`\n' "$k3s_instance"
  fi
  if [[ -n "$legacy_ip" ]]; then
    printf -- '- **Existing demo Elastic IP:** `%s`\n' "$legacy_ip"
  fi
  if [[ -n "$legacy_instance" ]]; then
    printf -- '- **Existing demo EC2 instance:** `%s`\n' "$legacy_instance"
  fi
  echo
  echo "### Private Argo CD dashboard"
  echo
  if [[ -n "$k3s_instance" ]]; then
    echo "Argo CD is accessible privately through AWS Systems Manager. AWS CLI and the Session Manager plugin are required."
    echo
    echo '~~~sh'
    printf 'aws ssm start-session --region eu-central-1 --target %s --document-name AWS-StartPortForwardingSession --parameters portNumber=18080,localPortNumber=8080\n' "$k3s_instance"
    echo '~~~'
    echo
    echo "Open **https://localhost:8080** while the session is active. The same single-line command works in PowerShell, Bash and cmd.exe."
  else
    echo "No active K3s instance exists in the current infrastructure state; no tunnel command is available."
  fi
  echo
  echo "### Argo CD administrator password"
  echo
  echo "The \`admin\` password is defined in the protected GitHub Environment \`demo-infra-apply\`, secret \`ARGOCD_PASSWORD\`."
  echo "[Open the environment settings](https://github.com/aleksei-sapozhnikov/aggregator/settings/environments/demo-infra-apply)"
  echo "Change the secret there and manually run Demo pipeline on demo with password sync enabled (once the workflow exists on main)."
  echo "The password never enters OpenTofu plans or state; only the bcrypt verifier crosses SSM."
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
