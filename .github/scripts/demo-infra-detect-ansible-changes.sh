#!/usr/bin/env bash
set -euo pipefail
changed=false
reason="No Ansible source changes detected."
: > "$RUNNER_TEMP/ansible-changed-files.txt"
: > "$RUNNER_TEMP/ansible-diff.patch"

if [[ "$GITHUB_EVENT_NAME" == workflow_dispatch ]]; then
  if [[ "$MANUAL_REAPPLY" == true ]]; then
    changed=true
    reason="Manual Ansible reapply requested; this run has no push-to-push Git diff."
  fi
elif [[ -z "$BASE_SHA" || "$BASE_SHA" =~ ^0+$ ]] || ! git cat-file -e "$BASE_SHA^{commit}"; then
  changed=true
  reason="Previous commit unavailable for comparison; conservatively reapplying Ansible."
else
  git diff --name-status "$BASE_SHA" "$GITHUB_SHA" -- deploy/ansible/ > "$RUNNER_TEMP/ansible-changed-files.txt"
  if [[ -s "$RUNNER_TEMP/ansible-changed-files.txt" ]]; then
    changed=true
    reason="Ansible sources changed between $BASE_SHA and $GITHUB_SHA."
    git diff --no-ext-diff --no-color "$BASE_SHA" "$GITHUB_SHA" -- deploy/ansible/ > "$RUNNER_TEMP/ansible-diff.patch"
  fi
fi

if [[ "$BOOTSTRAP_MISSING" == true && "$K3S_ENABLED" == true && "$changed" != true ]]; then
  changed=true
  reason="No published K3s release exists yet; reapplying Ansible to verify or complete cluster bootstrap."
fi

printf '%s\n' "$reason" > "$RUNNER_TEMP/ansible-change-reason.txt"
echo "ansible_changed=$changed" >> "$GITHUB_OUTPUT"
