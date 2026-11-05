#!/usr/bin/env bash
# Create the reviewed OpenTofu plan for demo infrastructure.
# Stores the saved plan and readable output under RUNNER_TEMP, detects
# instance creation/replacement, and exports has_changes and k3s_created
# through GITHUB_OUTPUT.
# Run from environments/demo/infra.

set -euo pipefail
set +e
tofu plan -input=false -no-color -detailed-exitcode -out="$RUNNER_TEMP/demo.tfplan" > "$RUNNER_TEMP/plan.log" 2>&1
status=$?
set -e
cat "$RUNNER_TEMP/plan.log"
if [[ "$status" != 0 && "$status" != 2 ]]; then exit "$status"; fi
if [[ "$status" == 2 ]]; then
  echo "has_changes=true" >> "$GITHUB_OUTPUT"
else
  echo "has_changes=false" >> "$GITHUB_OUTPUT"
fi
# Never apply a plan that would replace the serving K3s EC2 or destroy/reallocate
# the existing EIP. Module address moves are expected to be no-ops.
unsafe="$(tofu show -json "$RUNNER_TEMP/demo.tfplan" | jq -r '
  .resource_changes[]?
  | select(any(.change.actions[]?; . == "delete"))
  | .address
  | select(
      startswith("module.aggregator_demo_k3s")
      or . == "aws_eip.public"
      or . == "aws_eip_association.public"
      or . == "module.aggregator_demo.aws_eip.public"
      or . == "module.aggregator_demo.aws_eip_association.public"
    )
')"
if [[ -n "$unsafe" ]]; then
  echo "::error::Protected K3s/EIP resource would be destroyed: $unsafe" >&2
  exit 1
fi
k3s_created="$(tofu show -json "$RUNNER_TEMP/demo.tfplan" | jq -r '
  [.resource_changes[]?
    | select(.address == "module.aggregator_demo_k3s.aws_instance.this")
    | .change.actions[]?
    | select(. == "create")]
  | length > 0
')"
echo "k3s_created=$k3s_created" >> "$GITHUB_OUTPUT"
tofu show -no-color "$RUNNER_TEMP/demo.tfplan" > "$RUNNER_TEMP/plan.txt"
