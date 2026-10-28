#!/usr/bin/env bash
set -euo pipefail

# Executed on EC2 by the restricted SSM document as ec2-user.
: "$DEPLOY_SHA"
[[ "$DEPLOY_SHA" =~ ^[0-9a-f]{40}$ ]] || {
  echo "DEPLOY_SHA must be a full commit SHA" >&2
  exit 1
}

cd /home/ec2-user/aggregator-demo/repo
[[ "$(git rev-parse HEAD)" == "$DEPLOY_SHA" ]] || {
  echo "Checkout does not match the requested release SHA" >&2
  exit 1
}

# Each service keeps the same image reference until its Docker build context changes.
image_exports="$(python3 deploy/demo/image_tags.py compose-env --revision "$DEPLOY_SHA")"
eval "$image_exports"
export AGENT_AI_ENABLED="true"
export AGENT_AI_CONFIG='{"provider":"bedrock","max_tool_rounds":2,"bedrock":{"model_id":"eu.amazon.nova-lite-v1:0","aws_region":"eu-central-1","temperature":0.00001,"max_tokens":300}}'

make deploy ENV=demo
docker image prune --force || true
