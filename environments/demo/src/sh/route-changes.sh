#!/usr/bin/env bash
# Route a demo push to infrastructure and/or application deployment stages.
# Compares the Git push range and checks for a missing initial GitOps release.
# Outputs infra_changed, deploy_changed, and bootstrap_missing through
# GITHUB_OUTPUT; uses BASE_SHA for push-range detection.

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
      environments/demo/infra/*|environments/demo/ansible/*|environments/demo/src/sh/node-configure.sh|environments/demo/src/sh/ssm-node-configure.sh|environments/demo/src/sh/dispatch-ansible-ssm.sh|environments/demo/src/sh/route-changes.sh|environments/demo/src/sh/plan.sh|environments/demo/src/sh/check-ansible.sh|environments/demo/src/sh/s3-plan.sh|environments/demo/src/sh/check-flags.sh|environments/demo/src/sh/detect-ansible-changes.sh|environments/demo/src/sh/apply-summary.sh|environments/demo/src/sh/approval-summary.sh|environments/demo/src/sh/find-k3s-node.sh|environments/demo/src/python/config_fingerprint.py|tools/argocd/*|.github/workflows/demo-infra.yml)
        infra_changed=true
        ;;
      environments/shared/*|environments/demo/README.md|environments/demo/WORKFLOW.md|environments/demo/infra/README.md|environments/demo/ansible/README.md|docs/*|README.md|deploy/kubernetes/README.md|deploy/k8s-live/*|.github/workflows/demo-deploy.yml)
        # Non-demo infrastructure, generated releases, and documentation do not build images.
        ;;
      ?*)
        deploy_changed=true
        ;;
    esac
  done < <(git diff --name-only "$BASE_SHA" "$GITHUB_SHA")
fi
# Always check the last successful node configuration before application
# deploys. This retries a previously failed Ansible apply even if the next
# push only changes application sources or rewrites branch history.
if [[ "$deploy_changed" == true ]]; then
  infra_changed=true
fi
# GitOps lives on its own protected branch, independent of source force pushes.
# A missing published release needs rebuilding, not node reconfiguration.
gitops_branch="${GITOPS_BRANCH:-deploy/demo-gitops}"
[[ "$gitops_branch" == deploy/demo-gitops ]] || {
  echo "::error::Unexpected GitOps branch" >&2
  exit 1
}
git fetch --no-tags origin "refs/heads/$gitops_branch" >/dev/null
bootstrap_missing=false
if ! git cat-file -e FETCH_HEAD:deploy/k8s-live/kustomization.yaml 2>/dev/null; then
  bootstrap_missing=true
  infra_changed=true
fi
{
  echo "infra_changed=$infra_changed"
  echo "deploy_changed=$deploy_changed"
  echo "bootstrap_missing=$bootstrap_missing"
} >> "$GITHUB_OUTPUT"
echo "Infrastructure changes or first bootstrap needed: $infra_changed"
echo "Application changes: $deploy_changed"
echo "Initial GitOps release missing: $bootstrap_missing"
