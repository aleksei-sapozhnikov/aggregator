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

# Cloud-init provides only prerequisites and the reusable wrapper.
# The same Ansible command is used for a new node and subsequent changes.
command_line="$(cat <<SCRIPT
#!/bin/sh
set -eu
if ! cloud-init status --wait; then
  cloud-init status --long || true
  exit 1
fi
test -x /usr/local/sbin/aggregator-node-configure
/usr/local/sbin/aggregator-node-configure "$CONFIGURATION_SHA"
test "\$(cat /var/lib/aggregator-node/last-configured-revision)" = "$CONFIGURATION_SHA"
systemctl is-active --quiet k3s
/usr/local/bin/k3s kubectl get --raw=/readyz
/usr/local/bin/k3s kubectl --namespace argocd rollout status deployment/argocd-server --timeout=180s
/usr/local/bin/k3s kubectl --namespace kube-system rollout status deployment/traefik --timeout=300s
# Ansible owns cluster bootstrap, not application deployment or GitOps health.
# The Application is registered; demo-deploy publishes its manifests later.
/usr/local/bin/k3s kubectl -n argocd get application aggregator-demo >/dev/null
echo "K3s, Traefik and Argo CD bootstrapped at revision $CONFIGURATION_SHA"
SCRIPT
)"
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
