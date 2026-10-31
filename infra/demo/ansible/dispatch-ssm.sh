#!/usr/bin/env bash
# Apply a reviewed Ansible revision to a new or existing K3s EC2 using SSM.
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
  if [[ "$status" == Connected || "$status" == connected ]]; then
    connected=true
    break
  fi
  sleep 10
done

if [[ "$connected" != true ]]; then
  echo "The K3s node did not become connected to SSM" >&2
  exit 1
fi

# The submitted launcher is versioned in Git rather than baked into EC2 user_data.
# The only substituted input is a previously validated 40-character Git SHA.
script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
launcher_path="$script_dir/../ssm-node-configure.sh"
[[ -f "$launcher_path" ]] || { echo "SSM launcher is missing: $launcher_path" >&2; exit 1; }
command_line="$(cat "$launcher_path")"
[[ "$command_line" == *"__CONFIGURATION_SHA__"* ]] || {
  echo "SSM launcher revision placeholder is missing" >&2
  exit 1
}
command_line="${command_line//__CONFIGURATION_SHA__/$CONFIGURATION_SHA}"
parameters="$(jq -nc --arg command "$command_line" \
  '{commands: [$command], executionTimeout: ["2400"]}')"

command_id="$(aws ssm send-command \
  --region "$region" \
  --instance-ids "$SSM_INSTANCE_ID" \
  --document-name AWS-RunShellScript \
  --parameters "$parameters" \
  --cloud-watch-output-config 'CloudWatchOutputEnabled=true,CloudWatchLogGroupName=/aws/ssm/aggregator-demo-k3s' \
  --comment "Configure Aggregator K3s node at $CONFIGURATION_SHA" \
  --timeout-seconds 600 \
  --query Command.CommandId --output text)"

[[ -n "$command_id" && "$command_id" != None ]] || {
  echo "SSM did not return a command ID" >&2
  exit 1
}
echo "Started SSM Ansible command $command_id"
echo "Full SSM output: CloudWatch Logs group /aws/ssm/aggregator-demo-k3s (command $command_id)"

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
  echo "K3s configuration failed or timed out (SSM status: ${final_status:-unknown})" >&2
  exit 1
fi

echo "Configured K3s infrastructure on node $SSM_INSTANCE_ID at $CONFIGURATION_SHA"
if [[ -n "${GITHUB_STEP_SUMMARY:-}" ]]; then
  echo "K3s configuration succeeded at commit \`$CONFIGURATION_SHA\` using SSM command \`$command_id\`." >> "$GITHUB_STEP_SUMMARY"
  echo "Full SSM output: CloudWatch Logs group \`/aws/ssm/aggregator-demo-k3s\`." >> "$GITHUB_STEP_SUMMARY"
fi
