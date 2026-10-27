#!/usr/bin/env bash
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
    echo "- **Ansible:** Reapply the playbook over AWS SSM to the K3s EC2 (if provisioned). This can change packages, services and Kubernetes configuration."
  else
    echo "- **Ansible:** No run required; the K3s EC2 is not being created or reconfigured."
  fi
  if [[ "$ANSIBLE_CHANGED" == true || "$K3S_CREATED" == true ]]; then
    echo "- **Initial application release:** After Ansible succeeds, request the existing \`demo-deploy\` workflow only if published K3s manifests are missing."
  fi
  echo
  if [[ "$TERRAFORM_CHANGED" == true && "$ANSIBLE_CHANGED" == true ]]; then
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
    echo "**Execution:** The existing K3s node is configured through SSM after approval; the playbook runs with root privileges. A Git diff describes source changes, not a remote Ansible check-mode plan."
    if [[ -s "$RUNNER_TEMP/ansible-changed-files.txt" ]]; then
      echo
      echo "Changed source files: $(wc -l < "$RUNNER_TEMP/ansible-changed-files.txt" | tr -d ' '). Expand the Git diff below to review them."
      echo
      echo "<details>"
      echo "<summary>Changed Ansible files and Git diff (expand to inspect)</summary>"
      echo
      echo "**Changed files:**"
      echo
      echo '~~~text'
      cat "$RUNNER_TEMP/ansible-changed-files.txt"
      echo '~~~'
      echo
      echo "**Git diff:**"
      echo
      echo '~~~diff'
      head -c 120000 "$RUNNER_TEMP/ansible-diff.patch"
      echo
      if [[ $(wc -c < "$RUNNER_TEMP/ansible-diff.patch") -gt 120000 ]]; then
        echo '# Preview truncated at 120 KB. Inspect the full Git diff for the commit range.'
      fi
      echo '~~~'
      echo
      echo "</details>"
    else
      echo
      echo "No Ansible file diff is available for this run (manual reapply, unavailable commit range or first-bootstrap reconciliation). Review the selected commit and playbook before approval."
    fi
  elif [[ "$K3S_CREATED" == true ]]; then
    echo "No Ansible source changes detected. Ansible will still configure the newly created or replaced K3s EC2."
  else
    echo "No Ansible changes detected. Ansible will not be run."
  fi
} >> "$GITHUB_STEP_SUMMARY"
