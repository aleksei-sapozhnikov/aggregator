# Demo infrastructure workflow

[demo-infra.yml](../../../.github/workflows/demo-infra.yml) is the
**only automatic entry point** for pushes to `demo`. Its lightweight
`detect` job routes changes without AWS access. Terraform/Ansible
validation and planning run for infrastructure changes or whenever the
initial K3s GitOps release is missing and infrastructure automation is
enabled. Otherwise, application updates dispatch the existing
`demo-deploy.yml` directly without running Terraform.
Generated `deploy/k8s-live/**`-only promotion commits are excluded.
The `admin` and `publication` OpenTofu roots remain outside demo state.

## Branches and execution

Only `demo` pushes start this pipeline. Use `dev` for development and
local checks or pull-request validation:

- **`dev` — development only:** validate Terraform and Ansible locally
  or in review without applying AWS infrastructure.
- **`demo` — detect → optional validate/plan/approval/apply/Ansible → demo-deploy:**
  1. Validate the checked-out revision as above.
  2. Use unprotected, `demo`-branch-only Environment `demo-infra-plan`
     to assume the **read-only OIDC plan role** and access the demo infrastructure
     and its remote state. Generate `demo.tfplan` with
     `tofu plan -detailed-exitcode`. Render the plan in a
     `terraform` code block in the job summary and retain the exact plan
     artifact for seven days if it has changes.
  3. Request human approval through the `demo-infra-apply` Environment when there
     are Terraform changes or Ansible changes. The job fails closed without
     `MANUAL_APPROVAL_CONFIGURED=true` in that environment. The planning job
     explains **why** approval is needed even when Terraform reports no changes.
     Its GitHub Actions job summary shows the intended Terraform/Ansible actions,
     with a collapsed Terraform plan and a collapsed Git diff of changed Ansible
     sources. The Git diff is not an Ansible dry-run of the remote EC2.
  4. After approval, assume the **write OIDC apply role**, download and
     apply the _same saved plan_. Never generate a different plan during
     apply. When there are no Terraform changes, skip `tofu apply`.
     The apply job publishes a **separate GitHub Actions summary** after
     successful Terraform Apply (or an Ansible-only run): K3s and existing
     demo public IP addresses and EC2 IDs appear immediately, while all
     root OpenTofu outputs are in a collapsed `<details>` block. The full
     list uses `tofu output -no-color`, which redacts sensitive outputs;
     only explicitly non-sensitive connection fields are highlighted.
     It also prints a copyable one-line SSM tunnel command with the actual
     K3s instance ID, and includes a link to the `demo-infra-apply` GitHub
     Environment secret settings and rotation instructions.
     the SSM tunnel command can be copied from the Apply Summary.
  5. Detect creation or replacement of the K3s EC2 from the saved
     OpenTofu plan JSON. After successful apply, execute the same Ansible
     wrapper via SSM as for ordinary Ansible revisions. Supply the exact
     workflow commit SHA, not a separately maintained bootstrap variable.
  6. Ansible configures K3s, Traefik and Argo CD, and registers its
     Application. SSM checks the applied revision, Kubernetes API, Traefik
     and Argo CD readiness, and the Application resource's existence. It
     does **not** wait for application manifests or HTTP routes.
  7. The `request-demo-deploy` job executes only after the required
     infrastructure stages have succeeded. It dispatches the existing
     `demo-deploy.yml` if application files changed or an initial GitOps
     release is missing while K3s is enabled. When K3s is explicitly
     disabled and there are no application changes, teardown ends without
     requesting a new K3s release. If the reviewed plan actually destroys
     the K3s node, no application deployment is dispatched in that run,
     even if source changes were pushed alongside the infrastructure change.
     Deployment logic stays exclusively
     in `demo-deploy`. For application-only pushes with a published
     release, all Terraform/Ansible jobs are skipped.

Cloud-init only installs OS prerequisites and the root-owned Ansible wrapper.
It does **not** fetch the repository or run the playbook on its own.
Terraform owns the cloud-init template; changing that template intentionally
replaces the K3s EC2 (subject to the reviewed Terraform plan), rather than
restarting an instance without re-running cloud-init.

Changes under `deploy/ansible/**` reconfigure the existing EC2 through SSM,
without Terraform resource updates. Ordinary application changes use GitHub
image publication and Argo CD, without running Ansible. Once a GitOps release
exists, application-only pushes skip Terraform/Ansible entirely.
Before the first release, if `DEMO_INFRA_WORKFLOW_ENABLED=true`, even an
application-only push runs a Terraform Plan and, when K3s is enabled,
requires approval to reapply Ansible before deploying. This prevents
deploying to a cluster whose initial setup may have failed. On first
provisioning, the Argo CD Application can temporarily report
`ComparisonError` until
`demo-deploy.yml` publishes `deploy/k8s-live`. That does not fail
infrastructure configuration. App release failures are tracked separately.
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

This workflow never builds or publishes application images. Every
`demo` push enters a single ordering workflow; infrastructure changes
must pass Terraform/Ansible before the dispatch stage is reached.
Application-only changes bypass Terraform and proceed to `demo-deploy`.
The dispatch job holds `actions: write`, while the approved Terraform/SSM
job retains narrower permissions. A dispatched `demo-deploy` workflow
runs independently: infrastructure success does not imply application
deployment success. GitHub `workflow_dispatch` is available because
`demo-deploy.yml` exists on `main` (the repository default branch).

A push to `demo` is required before infrastructure can be applied;
changes in `dev` alone never deploy.

The workflow serializes itself with a concurrency group, and OpenTofu locks
its remote S3 state while running. External/manual changes can still cause
stale plans to fail.

### Disabling or destroying the optional K3s node

Set `ENABLE_K3S_NODE=false` in `demo-infra-plan`, trigger a new
infrastructure plan, and approve only if it destroys the resources under
`module.aggregator_demo_k3s[0]` without modifying the serving demo EC2.
When K3s is removed, OpenTofu may omit the `k3s_instance_id` root output
instead of returning JSON `null`. The node lookup treats both as
`available=false` and skips Ansible; it still fails if OpenTofu itself
cannot read the state. The workflow also skips an initial K3s release
when the node is disabled and no application sources changed. An actual
K3s teardown is detected from the saved plan, so the same pipeline run
never dispatches the app deployment after deleting the node. Restoring
`ENABLE_K3S_NODE=true` and running a new reviewed plan creates the
node again.

The workflow serializes itself with a concurrency group, and OpenTofu locks
its remote S3 state while running. External/manual changes can still cause
stale plans to fail.

## Argo CD administrator password: setup and rotation

Store the administrator password in the protected GitHub Environment
`demo-infra-apply` as the secret **`ARGOCD_PASSWORD`**. It must contain
16-72 UTF-8 bytes without line breaks. Do not put plaintext or a password
fingerprint in Git, Terraform variables, state, or plan artifacts.

During an approved infrastructure Apply, the script
`.github/scripts/demo-infra/sync-argocd-password.py` reads the bcrypt
verifier currently stored in the Kubernetes `argocd-secret` through
AWS SSM and checks the requested password with `bcrypt.checkpw`.
If it matches, the Secret stays unchanged. Otherwise the runner generates
a fresh bcrypt verifier with a random salt and sends only that verifier
through SSM to update `argocd-secret`. This does not require a separate
unsalted fingerprint or persistent comparison state.

### Rotate through GitHub Actions

1. Edit the Environment Secret `ARGOCD_PASSWORD` under
   **Settings → Environments → `demo-infra-apply`**.
2. Open **Actions → Demo pipeline → Run workflow** and select `demo`.
   Keep `sync_argocd_password=true` and `reapply_ansible=false`.
3. Review the infrastructure plan and approve `demo-infra-apply`.
   If there are no infrastructure or Ansible changes, only the password
   synchronization step changes the cluster. An unchanged password
   does not cause a Kubernetes Secret update.

Changing a GitHub secret does not itself start a workflow. The
`workflow_dispatch` trigger already exists and is also used for manual
Ansible reapplication. **GitHub requires the workflow file to exist on
the repository's default branch (`main`) to enable manual dispatch.**
Until it is promoted there, `dev` commits do not run a deployment, and
an eligible `demo` push is the available automatic trigger. Do not
assume the manual button is available merely because the YAML in `dev`
contains `workflow_dispatch`.

### Rotate from a local machine

Check out the relevant repository code and configure an AWS identity
authorized for `ssm:SendCommand` (`AWS-RunShellScript`) and
`ssm:GetCommandInvocation` against the demo K3s node, plus EC2 describe
permissions if you want automatic node discovery. The usual
`aggregator-admin` Session Manager tunnel access alone does not grant
these write permissions; do not expand that role just to support
routine password rotation.

Set `ARGOCD_PASSWORD` in the local process environment rather than
putting it in a shell command argument or a repository file. For
PowerShell, one way to avoid displaying the password when entering it is:

```powershell
$secure = Read-Host "New Argo CD password" -AsSecureString
$ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
try {
    $env:ARGOCD_PASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)
    python -m pip install boto3==1.40.53 bcrypt==4.3.0
    python .github/scripts/demo-infra/sync-argocd-password.py
} finally {
    Remove-Item Env:ARGOCD_PASSWORD -ErrorAction SilentlyContinue
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr)
}
```

Set `AWS_PROFILE` beforehand to an authorized profile. The script
verifies the target AWS account and resolves the unique running K3s
instance by EC2 tags, or accepts an explicit `SSM_INSTANCE_ID`.
The plaintext password remains local to the Python process; only a
bcrypt verifier is sent to AWS SSM. Use the approved workflow when
a suitable local AWS identity is not available.

### Connect to the Argo CD dashboard

The Apply Summary includes the current K3s EC2 ID and a copyable
one-line SSM tunnel command. Use AWS CLI and the Session Manager
plugin, then open `https://localhost:8080` and sign in as `admin`.
See [the Ansible README](../../ansible/README.md) for verification
and access details.

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


In the **Environment secrets** section of `demo-infra-apply`, create
`ARGOCD_PASSWORD` with a strong password (16-72 UTF-8 bytes).
The value is available only after required-reviewer approval and never
becomes an OpenTofu input. Keep it in the protected Environment, not
`demo-infra-plan` or repository-level secrets.

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
   the _serving_ demo EC2 or its IAM role, before approving `demo-infra-apply`.
   Previously created resources should appear in state rather than being
   created again.
4. Apply the reviewed plan, then let the workflow configure the new EC2
   through SSM and Ansible if an instance was created.

Never force-unlock state, remove resources from state or bypass IAM policy
boundaries as a workaround for these errors.

### Verifying CloudWatch Logs tag permissions after AccessDenied

The K3s Log Group is created **with tags**, so CloudWatch Logs authorizes
both `logs:CreateLogGroup` and a tagging action. If
`CreateLogGroup with Tags` is denied, first compare the _deployed_
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

The policy allows the exact named log group and its `:*` ARN form,
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
