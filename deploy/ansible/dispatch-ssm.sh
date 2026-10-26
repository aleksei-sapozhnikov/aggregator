#!/usr/bin/env bash
# Reapply a reviewed Ansible revision to the dedicated K3s node through SSM.
set -euo pipefail

: "${SSM_INSTANCE_ID:?SSM_INSTANCE_ID is required}"
: "${CONFIGURATION_SHA:?CONFIGURATION_SHA is required}"

[[ "$SSM_INSTANCE_ID" =~ ^i-[0-9a-f]+$ ]] || {
  echo "Invalid EC2 instance ID" >&2
  exit 2
}
[[ "$CONFIGURATION_SHA" =~ ^[0-9a-f]{40}$ ]] || {
  echo "CONFIGURATION_SHA must be a full lowercase Git SHA" >&2
  exit 2
}

region="${AWS_REGION:-eu-central-1}"
echo "Waiting for SSM connectivity on $SSM_INSTANCE_ID ($region)"
connected=false
for attempt in $(seq 1 90); do
  status="$(aws ssm get-connection-status \
    --region "$region" \
    --target "$SSM_INSTANCE_ID" \
    --query Status --output text 2>/dev/null || true)"
  if [[ "$status" == connected ]]; then
    connected=true
    break
  fi
  sleep 10
done

if [[ "$connected" != true ]]; then
  echo "The K3s node did not become connected to SSM" >&2
  exit 1
fi

# Wait for first-boot cloud-init before running the root-owned wrapper.
# Quote and validate the immutable SHA before embedding it in a shell command.
command_line="cloud-init status --wait && test -x /usr/local/sbin/aggregator-node-configure && /usr/local/sbin/aggregator-node-configure $CONFIGURATION_SHA"
parameters="$(jq -nc --arg command "$command_line" \
  '{commands: [$command], executionTimeout: ["2400"]}')"

command_id="$(aws ssm send-command \
  --region "$region" \
  --instance-ids "$SSM_INSTANCE_ID" \
  --document-name AWS-RunShellScript \
  --parameters "$parameters" \
  --comment "Reconcile Aggregator K3s node at $CONFIGURATION_SHA" \
  --timeout-seconds 600 \
  --query Command.CommandId --output text)"

[[ -n "$command_id" && "$command_id" != None ]] || {
  echo "SSM did not return a command ID" >&2
  exit 1
}
echo "Started SSM command $command_id"

final_status=""
for attempt in $(seq 1 240); do
  status="$(aws ssm get-command-invocation \
    --region "$region" \
    --command-id "$command_id" \
    --instance-id "$SSM_INSTANCE_ID" \
    --query Status --output text 2>/dev/null || true)"
  case "$status" in
    Success|Failed|Cancelled|TimedOut|DeliveryTimedOut|ExecutionTimedOut|Undeliverable|Terminated)
      final_status="$status"
      break
      ;;
    *)
      sleep 10
      ;;
  esac
done

aws ssm get-command-invocation \
  --region "$region" \
  --command-id "$command_id" \
  --instance-id "$SSM_INSTANCE_ID" \
  --query '{Status:Status,ResponseCode:ResponseCode,Stdout:StandardOutputContent,Stderr:StandardErrorContent}' \
  --output json || true

if [[ "$final_status" != Success ]]; then
  echo "Ansible reconciliation failed or timed out (SSM status: ${final_status:-unknown})" >&2
  exit 1
fi

echo "Reconciled node $SSM_INSTANCE_ID at $CONFIGURATION_SHA"
if [[ -n "${GITHUB_STEP_SUMMARY:-}" ]]; then
  echo "Ansible reconciled K3s node at commit \`$CONFIGURATION_SHA\` using SSM command \`$command_id\`." >> "$GITHUB_STEP_SUMMARY"
fi
