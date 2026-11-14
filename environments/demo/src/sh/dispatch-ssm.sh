#!/usr/bin/env bash
set -euo pipefail

: "$SSM_INSTANCE_ID"
: "$DEPLOY_SHA"
[[ "$SSM_INSTANCE_ID" =~ ^i-[0-9a-f]{8,17}$ ]] || {
  echo "Invalid EC2 instance ID" >&2
  exit 1
}
[[ "$DEPLOY_SHA" =~ ^[0-9a-f]{40}$ ]] || {
  echo "DEPLOY_SHA must be a full commit SHA" >&2
  exit 1
}

# The IAM role is scoped to this document and to the serving demo instance.
command_id="$(aws ssm send-command \
  --document-name AggregatorDemoDeploy \
  --instance-ids "$SSM_INSTANCE_ID" \
  --parameters "CommitSha=$DEPLOY_SHA" \
  --comment "Aggregator demo deployment $DEPLOY_SHA" \
  --query 'Command.CommandId' \
  --output text)"

echo "SSM command ID: $command_id"

# Newly issued commands may not be visible immediately; SSM is eventually consistent.
for attempt in $(seq 1 115); do
  if result="$(aws ssm get-command-invocation \
    --command-id "$command_id" \
    --instance-id "$SSM_INSTANCE_ID" \
    --output json 2>/dev/null)"; then
    status="$(printf '%s' "$result" | python3 -c 'import json,sys; print(json.load(sys.stdin)["Status"])')"
    case "$status" in
      Success)
        printf '%s' "$result" | python3 -c 'import json,sys; r=json.load(sys.stdin); print(r.get("StandardOutputContent","")); print(r.get("StandardErrorContent",""),file=sys.stderr)'
        echo "Demo deployed commit $DEPLOY_SHA"
        exit 0
        ;;
      Failed|Cancelled|TimedOut|DeliveryTimedOut|ExecutionTimedOut|Undeliverable|Terminated)
        printf '%s' "$result" | python3 -c 'import json,sys; r=json.load(sys.stdin); print(r.get("StandardOutputContent","")); print(r.get("StandardErrorContent",""),file=sys.stderr); print("SSM failure: "+r.get("StatusDetails","unknown"),file=sys.stderr)'
        exit 1
        ;;
    esac
  fi
  sleep 10
done

echo "Timed out waiting for SSM command $command_id" >&2
exit 1
