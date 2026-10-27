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
  3. Request human approval through the `demo-infra-apply` Environment when there
     are Terraform changes or Ansible changes. The job fails closed without
     `MANUAL_APPROVAL_CONFIGURED=true` in that environment.
  4. After approval, assume the **write OIDC apply role**, download and
     apply the _same saved plan_. Never generate a different plan during
     apply. When there are no Terraform changes, skip `tofu apply`.
  5. Detect creation or replacement of the K3s EC2 from the saved
     OpenTofu plan JSON. After successful apply, execute the same Ansible
     wrapper via SSM as for ordinary Ansible revisions. Supply the exact
     workflow commit SHA, not a separately maintained bootstrap variable.
  6. Ansible configures K3s, Traefik, Argo CD and its Application. The SSM
     command checks the applied revision, Kubernetes/API readiness and
     published application health. An error fails the approved job.

Cloud-init only installs OS prerequisites and the root-owned Ansible wrapper.
It does **not** fetch the repository or run the playbook on its own.
Terraform owns the cloud-init template; changing that template intentionally
replaces the K3s EC2 (subject to the reviewed Terraform plan), rather than
restarting an instance without re-running cloud-init.

Changes under `deploy/ansible/**` reconfigure the existing EC2 through SSM,
without Terraform resource updates. Ordinary application changes use GitHub
image publication and Argo CD, without running Ansible. With no relevant
changes, the workflow can skip apply altogether. On first provisioning,
`deploy/k8s-live` must already be published in the `demo` branch.
To retry failed configuration without replacing EC2, run a fresh
`workflow_dispatch` with `reapply_ansible=true` once the workflow exists on
the repository's default branch. This produces a fresh Terraform plan, usually
with no infrastructure changes, and reruns Ansible through SSM after approval.
Until the manual trigger is available, use an explicitly authorized SSM run or
a reviewed Ansible-only update in `demo`. Do not blindly reapply an old saved
Terraform plan: it can be stale after a successful infrastructure apply followed
by a failed Ansible run. Automatic retry of failed configurations without a new
workflow trigger is not implemented for this demo.

SSM Run Command streams stdout and stderr to CloudWatch Logs group
`/aws/ssm/aggregator-demo-k3s` with 14-day retention. The wrapper also
records complete logs on the instance at
`/var/log/aggregator-node-configure.log`.

This workflow does not modify the existing application deploy workflow
(`demo-deploy.yml`) and does not run any infrastructure steps for ordinary
application code changes. A push to `demo` is required before infrastructure
can be applied; changes in `dev` alone never deploy.

The workflow serializes itself with a concurrency group, and OpenTofu locks
its remote S3 state while running. External/manual changes can still cause
stale plans to fail.

## GitHub setup (required before enabling)

Configure Repository and Environment variables under **Settings → Secrets and variables → Actions → Variables** and **Settings → Environments**:

| Type                           | Name                          | Meaning                                                   |
| ------------------------------ | ----------------------------- | --------------------------------------------------------- |
| Repository                     | `DEMO_INFRA_WORKFLOW_ENABLED` | `true` enables AWS planning; validation works without it. |
| Environment `demo-infra-plan`  | `AWS_ROLE_ARN`                | Plan role ARN from the admin OpenTofu outputs.            |
| Environment `demo-infra-plan`  | `ENABLE_K3S_NODE`             | Explicit `true` or `false`.                               |
| Environment `demo-infra-plan`  | `ENABLE_BEDROCK`              | Explicit `true` or `false`.                               |
| Environment `demo-infra-apply` | `AWS_ROLE_ARN`                | Apply role ARN from the admin OpenTofu outputs.           |
| Environment `demo-infra-apply` | `MANUAL_APPROVAL_CONFIGURED`  | `true`, after Required reviewers are configured.          |

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

GitHub Environment `demo-infra-apply` must be configured under
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
defaults. **Setting `ENABLE_K3S_NODE=false` after creating the node
would plan its destruction.** Review the plan before approval.

No `K3S_BOOTSTRAP_GIT_REF` is needed. The workflow runs the precise
`github.sha` through SSM after apply. Changing the Ansible playbook alone
never changes EC2 `user_data`; cloud-init revisions intentionally require
a reviewed instance replacement.

The saved `demo.tfplan` may include sensitive infrastructure or state data
even when the rendered plan redacts it; treat Actions artifacts as sensitive.
Artifacts are retained seven days. If an approval cannot finish within that
period, rerun planning and review the new plan rather than applying a stale
one. Approval must be based on the actual plan, not only the status of checks.

## Recovering from a partially applied infrastructure plan

OpenTofu can create some resources before a later AWS API operation fails.
A failed `tofu apply` is **not** a transaction rollback. Do not delete
the created K3s IAM role, instance profile, security group or rules manually.
Those resources are expected to remain in the demo state.

Before retrying a failure caused by `AccessDenied`:

1. Apply the `deploy/infra/admin` root with the authorized `infra-admin`
   identity. The `AggregatorDemoEC2Management` policy already includes
   `logs:TagResource` for the dedicated K3s SSM log group. The
   `AggregatorDemoIAMManagement` policy must also permit attaching the
   approved Bedrock model policy to the existing `AggregatorDemoEC2Role`
   when `ENABLE_BEDROCK=true`. Commits do not deploy these IAM policies.
2. Trigger **a fresh** `demo-infra-plan` job against the updated remote
   state. A subsequent reviewed push affecting `deploy/infra/demo/**` will
   trigger the workflow. Do not reuse the previous saved plan artifact.
3. Examine the complete new plan, including any pending modifications to
   the *serving* demo EC2 or its IAM role, before approving `demo-infra-apply`.
   Previously created resources should appear in state rather than being
   created again.
4. Apply the reviewed plan, then let the workflow configure the new EC2
   through SSM and Ansible if an instance was created.

Never force-unlock state, remove resources from state or bypass IAM policy
boundaries as a workaround for these errors.

### Verifying CloudWatch Logs tag permissions after AccessDenied

The K3s Log Group is created **with tags**, so CloudWatch Logs authorizes
both `logs:CreateLogGroup` and a tagging action. If
`CreateLogGroup with Tags` is denied, first compare the *deployed*
managed policy with the source JSON; an updated Git file is not proof
that AWS has received the new policy version.

Using an administrative AWS identity with IAM read and simulation permissions:

```sh
aws iam list-attached-role-policies \
  --role-name AggregatorDemoInfraApplyGithub \
  --query 'AttachedPolicies[?PolicyName==`AggregatorDemoEC2Management`]'

aws iam get-policy \
  --policy-arn arn:aws:iam::905418096305:policy/AggregatorDemoEC2Management \
  --query 'Policy.DefaultVersionId' --output text

aws iam get-policy-version \
  --policy-arn arn:aws:iam::905418096305:policy/AggregatorDemoEC2Management \
  --version-id "$(aws iam get-policy \
    --policy-arn arn:aws:iam::905418096305:policy/AggregatorDemoEC2Management \
    --query 'Policy.DefaultVersionId' --output text)" \
  --query 'PolicyVersion.Document.Statement[?Sid==`ManageK3sSsmLogGroup`]'

aws iam simulate-principal-policy \
  --policy-source-arn arn:aws:iam::905418096305:role/AggregatorDemoInfraApplyGithub \
  --action-names logs:CreateLogGroup logs:TagResource logs:TagLogGroup \
  --resource-arns arn:aws:logs:eu-central-1:905418096305:log-group:/aws/ssm/aggregator-demo-k3s \
  --query 'EvaluationResults[].{Action:EvalActionName,Decision:EvalDecision}'
```

The policy allows the exact named log group and its `:* ` ARN form,
including the tagging actions needed at creation. If the simulation
shows `implicitDeny`, check the default policy version, attachment,
or additional IAM/SCP restrictions before another demo apply. The
simulation is diagnostic; if it says `allowed` but the actual API
still denies the call, inspect CloudTrail or open an AWS support case
with the CloudWatch Logs request ID. Do not broaden access to
`Resource: "*"` to bypass the error.

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

CloudWatch log permissions and the instance role boundary are defined in
`admin`. Apply `admin` before enabling K3s, then review and apply the demo
root through GitHub. The CloudWatch log group is created only if K3s is enabled.

To debug, inspect the plan/apply job summaries, CloudWatch SSM output, and
on-node `/var/log/cloud-init-output.log` or
`/var/log/aggregator-node-configure.log`.

## Public K3s application deployment

The new node is bootstrapped with K3s, bundled Traefik/ServiceLB and an
Argo CD Application following `demo:deploy/k8s-live`, containing only image
versions published after the corresponding GHCR build. See
[the K3s GitOps README](../../k8s/README.md) for prerequisites,
public HTTP-by-IP behaviour, image publication, rollback and limitations.
No DNS cutover is performed.
