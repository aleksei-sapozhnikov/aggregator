#!/usr/bin/env bash
# Validate explicitly configured demo infrastructure feature flags.
# Requires boolean ENABLE_K3S_NODE and ENABLE_BEDROCK values and exports
# the corresponding TF_VAR_* inputs through GITHUB_ENV for OpenTofu.

set -euo pipefail
[[ "$ENABLE_K3S_NODE" == true || "$ENABLE_K3S_NODE" == false ]] || {
  echo "::error::ENABLE_K3S_NODE must be explicitly true or false."
  exit 1
}
[[ "$ENABLE_BEDROCK" == true || "$ENABLE_BEDROCK" == false ]] || {
  echo "::error::ENABLE_BEDROCK must be explicitly true or false."
  exit 1
}
{
  echo "TF_VAR_enable_k3s_node=$ENABLE_K3S_NODE"
  echo "TF_VAR_enable_bedrock=$ENABLE_BEDROCK"
} >> "$GITHUB_ENV"
echo "k3s_enabled=$ENABLE_K3S_NODE" >> "$GITHUB_OUTPUT"
