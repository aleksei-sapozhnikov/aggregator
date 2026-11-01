#!/usr/bin/env bash
# Decide whether the existing K3s node must be reconfigured with Ansible.
# Compares the pushed Git range or handles manual/first-release reconciliation.
# Writes changed-file and diff previews to RUNNER_TEMP and the decision to
# GITHUB_OUTPUT for later approval and apply jobs.

set -euo pipefail
changed=false
reason="No node configuration source changes detected."
: > "$RUNNER_TEMP/ansible-changed-files.txt"
: > "$RUNNER_TEMP/ansible-diff.patch"

if [[ "$GITHUB_EVENT_NAME" == workflow_dispatch ]]; then
  if [[ "$MANUAL_REAPPLY" == true ]]; then
    changed=true
    reason="Manual Ansible reapply requested; this run has no push-to-push Git diff."
  fi
else
  # The previous demo commit may be unreachable from the new branch history
  # after a force push. Fetch its exact SHA before comparing configuration.
  if [[ -n "$BASE_SHA" && ! "$BASE_SHA" =~ ^0+$ ]] &&
     ! git cat-file -e "$BASE_SHA^{commit}" 2>/dev/null; then
    git fetch --no-tags --depth=1 origin "$BASE_SHA" >/dev/null 2>&1 || true
  fi

  if [[ -z "$BASE_SHA" || "$BASE_SHA" =~ ^0+$ ]] ||
     ! git cat-file -e "$BASE_SHA^{commit}" 2>/dev/null; then
    # Missing manifests or rewritten branch history must not automatically
    # reconfigure a healthy node. An unavailable baseline needs review.
    reason="Previous commit unavailable; cannot verify Ansible source changes. Use an explicit Ansible reconciliation if needed."
    echo "::warning::$reason" >&2
  else
    git diff --name-status "$BASE_SHA" "$GITHUB_SHA" -- infra/demo/ansible/ infra/demo/node-configure.sh infra/demo/ssm-node-configure.sh deploy/argocd/argocd-admin-hash.py > "$RUNNER_TEMP/ansible-changed-files.txt"
  if [[ -s "$RUNNER_TEMP/ansible-changed-files.txt" ]]; then
    changed=true
    reason="Node configuration or Argo CD helper changed between $BASE_SHA and $GITHUB_SHA."
    git diff --no-ext-diff --no-color "$BASE_SHA" "$GITHUB_SHA" -- infra/demo/ansible/ infra/demo/node-configure.sh infra/demo/ssm-node-configure.sh deploy/argocd/argocd-admin-hash.py > "$RUNNER_TEMP/ansible-diff.patch"
    fi
  fi
fi

# Missing GitOps manifests only require republishing the application release.
# Ansible is needed for changed node configuration, an explicit reapply, or
# a newly created K3s instance (handled by the workflow's k3s_created output).

printf '%s\n' "$reason" > "$RUNNER_TEMP/ansible-change-reason.txt"
echo "ansible_changed=$changed" >> "$GITHUB_OUTPUT"
