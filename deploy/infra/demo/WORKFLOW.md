# Demo infrastructure workflow

[demo-infra.yml](../../../.github/workflows/demo-infra.yml) is scoped to
`deploy/infra/demo` and `deploy/ansible` only. The `admin` and `publication`
OpenTofu roots are deliberately excluded.

## Branches and execution

Both `dev` and `demo` are watched for infrastructure changes:

- **`dev` — validate only:** `tofu fmt -check`, `tofu init -backend=false`,
  `tofu validate` and `ansible-playbook --syntax-check`. No AWS credentials
  are requested, and nothing is applied.
- **`demo` — validate → plan → approval → apply → Ansible:**
  1. Validate the checked-out revision as above.
  2. Use unprotected, `demo`-branch-only Environment `demo-infra-plan`
     to assume the **read-only OIDC plan role** and access the demo infrastructure
     and its remote state. Generate `demo.tfplan` with
     `tofu plan -detailed-exitcode`. Render the plan in a
     `terraform` code block in the job summary and retain the exact plan
     artifact for seven days if it has changes.
  3. Request human approval through the `demo-infra` Environment when there
     are Terraform changes or Ansible changes. The job fails closed without
     `MANUAL_APPROVAL_CONFIGURED=true` in that environment.
  4. After approval, assume the **write OIDC apply role**, download and
     apply the *same saved plan*. Never generate a different plan during
     apply. When there are no Terraform changes, skip `tofu apply`.
  5. If `deploy/ansible/**` changed (or a manual reapply is requested),
     find the optional K3s instance from OpenTofu outputs and call the
     instance's root-owned Ansible wrapper through AWS SSM using the exact
     triggering Git SHA. Ansible runs **only after successful apply**,
     and runs in the same approval job so there is just one approval.

A newly created K3s node also runs Ansible on first boot via cloud-init. On
first-boot runs the SSM command waits for cloud-init before reapplying. When
the optional K3s node is not provisioned, Ansible is explicitly skipped.
A Terraform-only update of an existing node does not require Ansible.

This workflow does not modify the existing application deploy workflow
(`demo-deploy.yml`) and does not run any infrastructure steps for ordinary
application code changes. A push to `demo` is required before infrastructure
can be applied; changes in `dev` alone never deploy.

The workflow serializes itself with a concurrency group, and OpenTofu locks
its remote S3 state while running. External/manual changes can still cause
stale plans to fail.

## GitHub setup (required before enabling)

Configure Repository and Environment variables under **Settings → Secrets and variables → Actions → Variables** and **Settings → Environments**:

| Type | Name | Meaning |
| --- | --- | --- |
| Repository | `DEMO_INFRA_WORKFLOW_ENABLED` | `true` enables AWS planning; validation works without it. |
| Environment `demo-infra-plan` | `AWS_ROLE_ARN` | Plan role ARN from the admin OpenTofu outputs. |
| Environment `demo-infra-plan` | `ENABLE_K3S_NODE` | Explicit `true` or `false`. |
| Environment `demo-infra-plan` | `ENABLE_BEDROCK` | Explicit `true` or `false`. |
| Environment `demo-infra-plan` when K3s enabled | `K3S_BOOTSTRAP_GIT_REF` | Full pinned commit SHA from `demo` history. |
| Environment `demo-infra` | `AWS_ROLE_ARN` | Apply role ARN from the admin OpenTofu outputs. |
| Environment `demo-infra` | `MANUAL_APPROVAL_CONFIGURED` | `true`, after Required reviewers are configured. |

**Do not create AWS access-key secrets.** Existing GitHub OIDC provider is
reused. Both infrastructure IAM roles, their trust policies, and their
managed permission policies are defined as IaC in
[the admin OpenTofu root](../admin/README.md). Apply `admin` first with
the authorized `infra-admin` identity and use its outputs for the GitHub
Environment-scoped `AWS_ROLE_ARN` values; do not create the roles manually.
The plan role's IAM trust now uses the subject `environment:demo-infra-plan`
instead of `ref:refs/heads/demo`; **apply admin again** before activating
this workflow. Each job resolves `AWS_ROLE_ARN` from its own Environment. The OIDC plan role must not
have infrastructure write privileges, because planning occurs **before**
manual approval. The existing `AggregatorDemoDeployGithub` role is
restricted to the old application deployment and is **not** reused.

Environment `demo-infra-plan` must allow only `demo` and have no Required
reviewers, so plan runs without manual confirmation.

GitHub Environment `demo-infra` must be configured under
**Settings → Environments**:

1. Add **Required reviewers** (allow self-review if you intend to approve
   your own pushes; do not enable Prevent self-review in that case).
2. Allow deployments from **only the `demo` branch**.
3. Only after both rules are saved, set the Environment variable
   `MANUAL_APPROVAL_CONFIGURED=true`.

Do not set `MANUAL_APPROVAL_CONFIGURED` as a repository variable.
The only Repository-level switch is `DEMO_INFRA_WORKFLOW_ENABLED` because
its job-level condition is checked before Environment variables are available. The flag
is an additional configuration guard, **not** a replacement for Environment
required-reviewer rules. Apply and Ansible share the same Environment approval.

GitHub `workflow_dispatch` generally requires a workflow file to exist on
the repository's default branch. Until this file is also present on `main`,
normal pushes to `dev` and `demo` are the supported triggers. The manual
reapply input becomes useful once that requirement is met.

## Infrastructure flags and review risks

The workflow refuses missing `ENABLE_K3S_NODE` and
`ENABLE_BEDROCK` variables rather than silently selecting Terraform
defaults. **Setting `DEMO_ENABLE_K3S_NODE=false` after creating the node
would plan its destruction.** Review the plan before approval.

The bootstrap ref is **required as a pinned SHA when K3s is enabled**.
It must be an ancestor of the current `demo` commit, and must remain stable
between runs, since changing EC2 user data may cause an EC2 update/restart.
For subsequent Ansible changes the workflow uses SSM and the immutable triggering revision, not cloud-init.

The saved `demo.tfplan` may include sensitive infrastructure or state data
even when the rendered plan redacts it; treat Actions artifacts as sensitive.
Artifacts are retained seven days. If an approval cannot finish within that
period, rerun planning and review the new plan rather than applying a stale
one. Approval must be based on the actual plan, not only the status of checks.

## SSM and troubleshooting

The approved write role must allow `ssm:SendCommand` on the K3s node and
`AWS-RunShellScript`, plus `ssm:GetConnectionStatus` and
`ssm:GetCommandInvocation`. The existing EC2 role's
`AmazonSSMManagedInstanceCore` policy is necessary but not sufficient for
the workflow to initiate commands.

The new role's SSM scope should be restricted to
`Name=aggregator-demo-k3s`, `Project=aggregator`, `Environment=demo`.
The role and SSM permissions are declared in `deploy/infra/admin` and
become available only after an approved OpenTofu apply of that root.
This demo workflow must not try to create or modify the admin root.

To debug, inspect the plan/apply job summaries, SSM command output, and
on-node `/var/log/cloud-init-output.log` or
`/var/log/aggregator-node-configure.log`.
