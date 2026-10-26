# Demo infrastructure workflow

The GitHub Actions workflow
[demo-infra.yml](../../../.github/workflows/demo-infra.yml) provisions **only**
the `deploy/infra/demo` OpenTofu root and reconciles
`deploy/ansible` on the optional K3s node. It deliberately does **not**
operate on the `admin` or `publication` OpenTofu roots.

## Execution

A push to `dev` affecting the demo infrastructure, Ansible, or the workflow
starts a run after setup has been enabled:

1. **plan** — check Ansible syntax; validate the demo OpenTofu root; create
   `demo.tfplan` using `-detailed-exitcode`. The plan is rendered in the
   GitHub job summary as a `terraform` code block and stored as a 7-day
   artifact if it contains changes.
2. **apply** — wait for approval through the GitHub environment
   `demo-infra`. After approval, apply **the exact saved plan** (never
   create another plan in this job). If the plan has no changes, skip OpenTofu
   apply but keep the approval step for Ansible changes.
3. **configure** — only when the Ansible files changed, or a manual reapply
   was requested. Run the local, root-owned Ansible wrapper on the EC2 K3s
   node through SSM Run Command, passing the immutable triggering commit SHA.
   It starts only after successful completion of the apply job.

If K3s is disabled, the configure job reports that Ansible was skipped.
New nodes also run cloud-init and Ansible during first boot; the SSM command
waits for cloud-init before reconciling. Terraform-only updates do not
unnecessarily run Ansible against existing instances.

The workflow uses one concurrency group to reduce overlap with itself.
Manual OpenTofu/SSM changes made outside the workflow can still cause drift;
a stale plan fails rather than silently creating a different plan. An S3 state
lock protects the state while OpenTofu is running.

## One-time repository configuration

This workflow is **disabled by default**. In GitHub repository
**Settings → Secrets and variables → Actions**, configure:

| Kind | Name | Value |
| --- | --- | --- |
| Repository variable | `DEMO_INFRA_WORKFLOW_ENABLED` | `true` to enable the workflow |
| Repository variable | `DEMO_ENABLE_K3S_NODE` | Explicitly `true` or `false` |
| Repository variable | `DEMO_ENABLE_BEDROCK` | Explicitly `true` or `false` |
| Optional repository variable | `DEMO_K3S_BOOTSTRAP_GIT_REF` | `dev` or an immutable 40-character commit SHA |
| Repository secret | `AGGREGATOR_ADMIN_AWS_ACCESS_KEY_ID` | Access key ID for AWS IAM user `aggregator-admin` |
| Repository secret | `AGGREGATOR_ADMIN_AWS_SECRET_ACCESS_KEY` | Corresponding secret access key |

**Set the feature flags to reflect the existing applied infrastructure.**
Notably, setting `DEMO_ENABLE_K3S_NODE=false` after a node has been created
can generate a *destructive* plan. A changed bootstrap revision may also cause
an EC2 update, although cloud-init itself only runs on first boot. Do not set
the revision to a new Git SHA on every push; changing Ansible is handled via
SSM instead. The workflow rejects missing feature flags to avoid silently
falling back to potentially destructive defaults.

The workflow uses the **actual `aggregator-admin` identity**, verifying
its AWS account and user ARN. The existing GitHub OIDC role
`AggregatorDemoDeployGithub` has permissions only for deploying the
currently serving Docker Compose demo and must not be reused for this
infrastructure workflow. Repository secrets holding long-lived AWS keys
are a compromise; if a separate, narrowly trusted OIDC infrastructure role
is later created, the authentication steps can be migrated without changing
the workflow's ordering or approval controls. Rotate and scope keys carefully.

### Required manual approval

Under **Settings → Environments**, create `demo-infra` and:

1. Enable **Required reviewers**, selecting your account or intended approver.
   If you plan to approve your own pushes, leave **Prevent self-review**
   disabled.
2. Restrict the deployment environment to the `dev` branch.
3. Only **after protection rules are saved**, create the **environment
   variable** `DEMO_INFRA_APPROVAL_CONFIGURED=yes`.

The workflow fails closed if this variable is missing, but the variable is
**not itself a substitute** for configuring required reviewers. Without
GitHub's environment protection, a job does *not* wait for approval.

The repository is public, so GitHub environment required-reviewer protection
is available on supported plans. This workflow file currently exists only
on `dev`: normal pushes to `dev` trigger it, but GitHub generally requires
a workflow to exist on the default branch for a `workflow_dispatch` run to
be launched from the Actions UI.

## SSM permission prerequisite

The EC2 role already has `AmazonSSMManagedInstanceCore`, but that is
**not enough** for the GitHub workflow to send an SSM Run Command.
The existing `aggregator-admin` IAM policies cover interactive Session
Manager sessions and managing the original demo deployment document; they
do not explicitly grant this K3s Run Command.

Before enabling Ansible execution, an AWS administrator must grant the
`aggregator-admin` user or its group:

- `ssm:SendCommand` on `AWS-RunShellScript` and *only* the
  `aggregator-demo-k3s` instance (using resource tags
  `Project=aggregator`, `Environment=demo`, `Name=aggregator-demo-k3s`
  to constrain the instance);
- `ssm:GetCommandInvocation` to poll command completion;
- `ssm:GetConnectionStatus` to wait for the instance to register with SSM
  (already granted by the existing session policy).

**Important:** `AWS-RunShellScript` can execute arbitrary privileged commands
on the permitted instance, so these permissions should be tightly scoped.
A dedicated, fixed-purpose SSM document is preferable to the generic
document if this moves beyond a personal demo. IAM ownership and setup
remain outside this workflow; the shared `admin` root is not modified.

## Approval and troubleshooting

Review the job summary (rendered with a `terraform` code fence), not merely
the presence of a green plan check. Select **Review deployments** and approve
`demo-infra` only when the proposed actions are acceptable. An
unapproved job cannot continue.

Saved `demo.tfplan` may contain *sensitive state or configuration values
even when the textual plan redacts them*. GitHub Actions artifacts are
retained for seven days and should only be accessible to authorized people.
If review takes longer than seven days, restart the run to produce a fresh
plan. The plan is not committed to Git.

Ansible execution status and a shortened output are shown in the SSM
job logs. Full bootstrap and playbook details remain in
`/var/log/cloud-init-output.log` and
`/var/log/aggregator-node-configure.log` on the node.

The `demo` root still lives alongside two unrelated OpenTofu roots only for
repository history and compatibility. Their migration to a separate
repository does not need to affect this workflow.
