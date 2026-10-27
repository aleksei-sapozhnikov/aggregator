#!/usr/bin/env bash
set -euo pipefail
infra_changed=false
deploy_changed=false
if [[ "$GITHUB_EVENT_NAME" == workflow_dispatch ]]; then
  # Manual runs are infrastructure reconciliations, not forced image rebuilds.
  infra_changed=true
elif [[ -z "$BASE_SHA" || "$BASE_SHA" =~ ^0+$ ]] || ! git cat-file -e "$BASE_SHA^{commit}"; then
  # Fail safe when the push range is unavailable.
  infra_changed=true
  deploy_changed=true
else
  while IFS= read -r path; do
    case "$path" in
      deploy/infra/demo/*|deploy/ansible/*|.github/workflows/demo-infra.yml|.github/scripts/demo-infra-*.sh)
        infra_changed=true
        ;;
      deploy/infra/*|deploy/k8s/README.md|deploy/k8s-live/*|.github/workflows/demo-deploy.yml)
        # Infrastructure administration, generated releases and docs do not build images.
        ;;
      ?*)
        deploy_changed=true
        ;;
    esac
  done < <(git diff --name-only "$BASE_SHA" "$GITHUB_SHA")
fi
# A missing first release means cluster bootstrap must be reconciled
# before an application deploy, even on a code-only push.
bootstrap_missing=false
if ! git cat-file -e HEAD:deploy/k8s-live/kustomization.yaml 2>/dev/null; then
  bootstrap_missing=true
  if [[ "$INFRA_WORKFLOW_ENABLED" == true ]]; then
    infra_changed=true
  fi
fi
{
  echo "infra_changed=$infra_changed"
  echo "deploy_changed=$deploy_changed"
  echo "bootstrap_missing=$bootstrap_missing"
} >> "$GITHUB_OUTPUT"
echo "Infrastructure changes or first bootstrap needed: $infra_changed"
echo "Application changes: $deploy_changed"
echo "Initial GitOps release missing: $bootstrap_missing"
