#!/usr/bin/env bash
# Find the serving K3s instance after apply and validate its instance ID.

set -euo pipefail
# Query all outputs: a named output disappears when its value is null.
# A failing tofu command must still fail the workflow (pipefail is enabled).
instance_id="$(tofu output -json | jq -r '.k3s_instance_id.value // empty')"
if [[ "$instance_id" =~ ^i-[a-f0-9]+$ ]]; then
  echo "available=true" >> "$GITHUB_OUTPUT"
  echo "instance_id=$instance_id" >> "$GITHUB_OUTPUT"
else
  echo "::error::Unexpected K3s instance ID in OpenTofu output."
  exit 1
fi
