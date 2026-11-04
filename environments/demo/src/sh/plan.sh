#!/usr/bin/env bash
# Create the reviewed OpenTofu plan for demo infrastructure.
# Stores the saved plan and readable output under RUNNER_TEMP, detects
# instance creation/replacement or removal, and exports has_changes,
# k3s_created, and k3s_destroyed through GITHUB_OUTPUT.
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
# Detect both first-time creation and replacement using the saved plan.
k3s_created="$(tofu show -json "$RUNNER_TEMP/demo.tfplan" | jq -r '
  [.resource_changes[]?
    | select(.address == "module.aggregator_demo_k3s[0].aws_instance.this")
    | .change.actions[]?
    | select(. == "create")]
  | length > 0
')"
echo "k3s_created=$k3s_created" >> "$GITHUB_OUTPUT"
# Only a pure delete is a teardown. Replacement will create another node.
k3s_destroyed="$(tofu show -json "$RUNNER_TEMP/demo.tfplan" | jq -r '
  [.resource_changes[]?
    | select(.address == "module.aggregator_demo_k3s[0].aws_instance.this")
    | select(.change.actions == ["delete"])]
  | length > 0
')"
echo "k3s_destroyed=$k3s_destroyed" >> "$GITHUB_OUTPUT"
tofu show -no-color "$RUNNER_TEMP/demo.tfplan" > "$RUNNER_TEMP/plan.txt"
