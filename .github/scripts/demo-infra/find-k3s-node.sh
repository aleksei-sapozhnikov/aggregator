#!/usr/bin/env bash
# Find the optional K3s EC2 instance in OpenTofu outputs after apply.
# Validates its instance ID and sets available/instance_id in GITHUB_OUTPUT
# so the workflow knows whether to run Ansible through SSM.

set -euo pipefail
instance_id="$(tofu output -json k3s_instance_id | jq -r '. // empty')"
if [[ -z "$instance_id" ]]; then
  echo "available=false" >> "$GITHUB_OUTPUT"
  echo "Ansible skipped: optional K3s node is not provisioned." >> "$GITHUB_STEP_SUMMARY"
elif [[ "$instance_id" =~ ^i-[a-f0-9]+$ ]]; then
  echo "available=true" >> "$GITHUB_OUTPUT"
  echo "instance_id=$instance_id" >> "$GITHUB_OUTPUT"
else
  echo "::error::Unexpected K3s instance ID in OpenTofu output."
  exit 1
fi
