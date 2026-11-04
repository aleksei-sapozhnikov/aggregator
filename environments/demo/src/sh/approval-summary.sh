#!/usr/bin/env bash
# Write the infrastructure approval review to the GitHub Actions job summary.
# Explains Terraform and Ansible actions and shows collapsible plan and Git diff.
# Reads TERRAFORM_CHANGED, ANSIBLE_CHANGED, K3S_CREATED, and RUNNER_TEMP;
# appends the review to GITHUB_STEP_SUMMARY.

set -euo pipefail
{
  echo "## Demo infrastructure - approval review"
  echo
  echo "Commit: \`$GITHUB_SHA\`"
  echo
  echo "### What happens after approval"
  if [[ "$TERRAFORM_CHANGED" == true ]]; then
    echo "- **Terraform:** Apply the exact saved plan displayed below."
  else
    echo "- **Terraform:** No infrastructure changes. Terraform Apply will be skipped."
  fi
  if [[ "$ANSIBLE_CHANGED" == true || "$K3S_CREATED" == true ]]; then
    echo "- **Ansible:** Apply the reviewed node configuration over AWS SSM. The desired fingerprint differs from the last successful SSM record, or a new K3s node/manual reapply requires it."
  else
    echo "- **Ansible:** No run required; the K3s EC2 is not being created or reconfigured."
  fi
  if [[ "$ANSIBLE_CHANGED" == true || "$K3S_CREATED" == true ]]; then
    echo "- **Initial application release:** After Ansible succeeds, request the existing \`demo-deploy\` workflow only if published K3s manifests are missing."
  fi
  if [[ "$PASSWORD_SYNC_REQUESTED" == true ]]; then
    echo "- **Argo CD password:** Reconcile the protected GitHub Environment secret without exposing plaintext to Terraform or AWS SSM."
  elif [[ "$ANSIBLE_CHANGED" == true || "$K3S_CREATED" == true ]]; then
    echo "- **Argo CD password:** After configuration, verify the bcrypt hash against the protected GitHub Environment secret and update only when needed."
  fi
  echo
  if [[ "$PASSWORD_SYNC_REQUESTED" == true ]]; then
    echo "**Why approval is required:** Argo CD administrator password reconciliation was explicitly requested (alongside any infrastructure changes above)."
  elif [[ "$TERRAFORM_CHANGED" == true && "$ANSIBLE_CHANGED" == true ]]; then
    echo "**Why approval is required:** Both Terraform and Ansible changes were detected."
  elif [[ "$TERRAFORM_CHANGED" == true ]]; then
    echo "**Why approval is required:** Terraform plans infrastructure changes."
  elif [[ "$ANSIBLE_CHANGED" == true ]]; then
    echo "**Why approval is required:** Ansible will be reapplied, even though Terraform has no changes."
  else
    echo "**No approval required:** Neither Terraform nor Ansible changes were detected."
  fi
  echo
  echo "### Terraform"
  if [[ "$TERRAFORM_CHANGED" == true ]]; then
    echo "Infrastructure changes are planned. Review the details before approving."
  else
    echo "No changes. The saved Terraform plan will not be applied."
  fi
  echo
  echo "<details>"
  echo "<summary>Terraform plan (expand to inspect)</summary>"
  echo
  echo '~~~terraform'
  head -c 120000 "$RUNNER_TEMP/plan.txt"
  echo
  if [[ $(wc -c < "$RUNNER_TEMP/plan.txt") -gt 120000 ]]; then
    echo '# Preview truncated at 120 KB. Review the complete plan in the job log.'
  fi
  echo '~~~'
  echo
  echo "</details>"
  echo
  echo "### Ansible"
  if [[ "$ANSIBLE_CHANGED" == true ]]; then
    cat "$RUNNER_TEMP/ansible-change-reason.txt"
    echo
    echo "**Execution:** The node is configured through SSM after approval. The fingerprint covers Ansible playbooks, pinned versions and launcher scripts, not Git commit identity."
    echo "The workflow records the fingerprint in Parameter Store only after successful execution and readiness checks."

  elif [[ "$K3S_CREATED" == true ]]; then
    echo "No Ansible source changes detected. Ansible will still configure the newly created or replaced K3s EC2."
  else
    echo "No Ansible changes detected. Ansible will not be run."
  fi
} >> "$GITHUB_STEP_SUMMARY"
