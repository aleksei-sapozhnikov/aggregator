#!/usr/bin/env bash
# Verify K3s first boot or reapply a reviewed Ansible revision using SSM.
set -euo pipefail

: "${SSM_INSTANCE_ID:?SSM_INSTANCE_ID is required}"
: "${CONFIGURATION_SHA:?CONFIGURATION_SHA is required}"
SSM_MODE="${SSM_MODE:-reconcile}"
[[ "$SSM_MODE" == verify || "$SSM_MODE" == reconcile ]] || {
  echo "SSM_MODE must be verify or reconcile" >&2
  exit 2
}

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

# Wait for cloud-init to complete and fail on bootstrap errors.
# New instances are verified without reinstalling Ansible a second time.
# The revision and mode interpolated here were validated above.
command_line="$(cat <<SCRIPT
#!/bin/sh
set -eu
if ! cloud-init status --wait; then
  cloud-init status --long || true
  test ! -f /var/log/aggregator-node-configure.log || cat /var/log/aggregator-node-configure.log
  exit 1
fi
if [ "$SSM_MODE" = verify ]; then
  test -f /var/lib/aggregator-node/last-configured-revision
  test "\$(cat /var/lib/aggregator-node/last-configured-revision)" = "$CONFIGURATION_SHA"
  cat /var/log/aggregator-node-configure.log
else
  test -x /usr/local/sbin/aggregator-node-configure
  /usr/local/sbin/aggregator-node-configure "$CONFIGURATION_SHA"
fi
systemctl is-active --quiet k3s
/usr/local/bin/k3s kubectl get --raw=/readyz
/usr/local/bin/k3s kubectl --namespace argocd rollout status deployment/argocd-server --timeout=180s
/usr/local/bin/k3s kubectl --namespace kube-system rollout status deployment/traefik --timeout=300s
# The release branch may be published while a new VM is still bootstrapping.
# Argo CD reconciles it independently; wait for the full application to become healthy.
sync=""
health=""
for attempt in \$(seq 1 150); do
  sync="\$(/usr/local/bin/k3s kubectl -n argocd get application aggregator-demo -o jsonpath='{.status.sync.status}' 2>/dev/null || true)"
  health="\$(/usr/local/bin/k3s kubectl -n argocd get application aggregator-demo -o jsonpath='{.status.health.status}' 2>/dev/null || true)"
  if [ "\$sync" = Synced ] && [ "\$health" = Healthy ]; then
    break
  fi
  sleep 10
done
if [ "\$sync" != Synced ] || [ "\$health" != Healthy ]; then
  /usr/local/bin/k3s kubectl -n argocd get application aggregator-demo -o yaml || true
  /usr/local/bin/k3s kubectl -n aggregator get pods -o wide || true
  echo "GitOps application is not healthy (sync=\$sync health=\$health)" >&2
  exit 1
fi
# Check the real HTTP entrypoint, not merely the in-cluster Kubernetes Service.
curl --fail --silent --show-error --retry 20 --retry-delay 3 http://127.0.0.1/config.json >/dev/null
curl --fail --silent --show-error --retry 20 --retry-delay 3 http://127.0.0.1/catalog/api/catalog/items >/dev/null
curl --fail --silent --show-error --retry 20 --retry-delay 3 http://127.0.0.1/api/product-health/items >/dev/null
curl --fail --silent --show-error --retry 20 --retry-delay 3 http://127.0.0.1/grafana/api/health >/dev/null
echo "K3s, Traefik, Argo CD and Aggregator healthy at revision $CONFIGURATION_SHA"
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
  --comment "$SSM_MODE Aggregator K3s node at $CONFIGURATION_SHA" \
  --timeout-seconds 600 \
  --query Command.CommandId --output text)"

[[ -n "$command_id" && "$command_id" != None ]] || {
  echo "SSM did not return a command ID" >&2
  exit 1
}
echo "Started SSM command $command_id ($SSM_MODE)"
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
  echo "K3s $SSM_MODE failed or timed out (SSM status: ${final_status:-unknown})" >&2
  exit 1
fi

echo "Verified node $SSM_INSTANCE_ID at $CONFIGURATION_SHA ($SSM_MODE)"
if [[ -n "${GITHUB_STEP_SUMMARY:-}" ]]; then
  echo "K3s $SSM_MODE succeeded at commit \`$CONFIGURATION_SHA\` using SSM command \`$command_id\`." >> "$GITHUB_STEP_SUMMARY"
  echo "Full SSM output: CloudWatch Logs group \`/aws/ssm/aggregator-demo-k3s\`." >> "$GITHUB_STEP_SUMMARY"
fi
