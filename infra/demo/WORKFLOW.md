# Demo infrastructure workflow

[demo-infra.yml](../../../.github/workflows/demo-infra.yml) is the
**only automatic entry point** for pushes to `deploy/demo`. Its lightweight
`detect` job routes changes without AWS access. Terraform/Ansible
validation and planning run for infrastructure changes, application updates
and missing GitOps releases, so every application deployment checks the
last successfully applied Ansible fingerprint. Missing manifests alone do
not trigger Ansible. `tofu apply` is skipped for an unchanged plan.
Generated `deploy/k8s-live/**` lives only on the separate protected
`deploy/demo-gitops` branch. Its publication commits do not trigger
infrastructure or application workflows.
The `admin` and `publication` OpenTofu roots remain outside demo state.

## Deployment branch separation

The source branch is `deploy/demo`, which can be force-pushed. The published
GitOps branch is `deploy/demo-gitops`, which must retain fast-forward history.
Argo CD reads only `deploy/demo-gitops:deploy/k8s-live`; no source push deletes
its manifests. The CI workflow uses `SOURCE_BRANCH` and `GITOPS_BRANCH` in
its YAML, while `on.push.branches` explicitly names `deploy/demo`.
The IAM role trusts GitHub Environments rather than branch names; update the
allowed deployment branches in all three GitHub Environments when migrating.

The Compose SSM Document also uses `deploy/demo` in its checked Git ref.
This one-time document update appears in the reviewed OpenTofu plan and
requires approval; it does not require replacing the serving EC2.

## Branches and execution

Only `deploy/demo` pushes start this pipeline. Use `dev` for development and
local checks or pull-request validation:

- **`dev` — development only:** validate Terraform and Ansible locally
  or in review without applying AWS infrastructure.
- **`deploy/demo` — detect → optional validate/plan/approval/apply/Ansible → demo-deploy:**
  1. Validate the checked-out revision as above.
  2. Use unprotected, `deploy/demo`-branch-only Environment `demo-infra-plan`
     to assume the **read-only infrastructure OIDC plan role** (with narrowly
     scoped conditional `s3:PutObject` access to the private plan prefix)
     and access the demo infrastructure and its remote state. Generate
     `demo.tfplan` with `tofu plan -detailed-exitcode`. Render the plan in a
     `terraform` code block in the job summary and upload the exact binary
     plan to private S3 under `plans/demo/<run-id>/<attempt>/demo.tfplan`.
     Publish its SHA-256 as a GitHub job output.
  3. After planning, compute a SHA-256 fingerprint of tracked node configuration
     files (Ansible roles, group variables, site playbook, launch scripts, and
     Argo CD node helper). Compare it and the current EC2 ID with the last
     successfully applied value in AWS SSM Parameter Store. Missing records,
     different fingerprints, and a new/replaced instance require Ansible.
     Read failures other than ParameterNotFound fail the job. Request human
     approval through the `demo-infra-apply` Environment for any Terraform
     changes or Ansible configuration work. Approval is still required when
     Terraform reports No changes, but Ansible reconciliation is needed.
  4. After approval, assume the **write OIDC apply role**, download the saved
     plan from private S3, verify its SHA-256 against the planning job output,
     then apply the _same saved plan_. Abort on checksum mismatch or absent
     S3 object. Never generate a different plan during apply. When there
     are no Terraform changes, skip `tofu apply`.
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
     OpenTofu plan JSON. After successful apply, execute the versioned SSM launcher,
     which fetches the exact workflow commit SHA and calls that revision's
     `infra/demo/node-configure.sh` rather than the old EC2 wrapper.
  6. Ansible configures K3s, Traefik and Argo CD, and registers its
     Application. SSM checks the applied revision, Kubernetes API, Traefik
     and Argo CD readiness, and the Application resource's existence. It
     does **not** wait for application manifests or HTTP routes. Only after
     SSM succeeds does the approved apply job record
     `<instance-id>:<config-fingerprint>` in SSM Parameter Store. A failed
     configuration or failed record leaves the previous successful value
     unchanged and is retried on the next applicable push.
  7. The `request-demo-deploy` job executes only after the required
     infrastructure stages have succeeded. It dispatches the existing
     `demo-deploy.yml` if application files changed or an initial GitOps
     release is missing while K3s is enabled. When K3s is explicitly
     disabled and there are no application changes, teardown ends without
     requesting a new K3s release. If the reviewed plan actually destroys
     the K3s node, no application deployment is dispatched in that run,
     even if source changes were pushed alongside the infrastructure change.
     Deployment logic stays exclusively
     in `demo-deploy`. Application-only pushes still perform read-only
     OpenTofu planning and fingerprint verification to retry a previously
     failed node reconciliation; no apply occurs when both match.

Cloud-init installs only OS prerequisites; it does not embed a shell
wrapper or reference repository paths. The approved SSM launcher fetches
the exact revision and runs the version-owned Ansible entrypoint.
Terraform owns the cloud-init template. The transition to a minimal template
intentionally replaces **only the K3s EC2** via
`user_data_replace_on_change = true`; its local-path PVC data is discarded.
The legacy serving demo must not be replaced.

Changes under `infra/demo/ansible/**`, either of the versioned
`infra/demo/{ssm-node-configure,node-configure}.sh` scripts, or
`deploy/argocd/argocd-admin-hash.py` reconfigure the existing EC2 through SSM,
without Terraform resource updates. Ordinary application changes use GitHub
image publication and Argo CD, without running Ansible. Once a GitOps release exists, application-only pushes still perform a read-only
plan and fingerprint comparison. Ansible is skipped when the recorded
configuration matches, regardless of rewritten Git commit history.
Force pushes that remove the generated release trigger republishing without
forcing Ansible. Failed Ansible attempts are retried because only successful
configurations update the stored fingerprint.
Before the first release, even an
application-only push runs a Terraform Plan. A missing GitOps release does
not require Ansible when the existing K3s node has a matching successful
fingerprint record. Ansible runs for changed configuration, a missing
successful record, an explicit manual reapply, or a new/replaced K3s instance
after approved infrastructure changes. On first
provisioning, the Argo CD Application can temporarily report
`ComparisonError` until
`demo-deploy.yml` publishes `deploy/k8s-live`. That does not fail
infrastructure configuration. App release failures are tracked separately.
To retry failed configuration without replacing EC2, run a fresh
`workflow_dispatch` with `reapply_ansible=true` once the workflow exists on
the repository's default branch. This produces a fresh Terraform plan, usually
with no infrastructure changes, and reruns Ansible through SSM after approval.
Until the manual trigger is available, use an explicitly authorized SSM run or
a reviewed Ansible-only update in `deploy/demo`. Do not blindly reapply an old saved
Terraform plan: it can be stale after a successful infrastructure apply followed
by a failed Ansible run. Automatic retry of failed configurations without a new
workflow trigger is not implemented for this demo.

SSM Run Command streams stdout and stderr to CloudWatch Logs group
`/aws/ssm/aggregator-demo-k3s` with 14-day retention. The versioned Ansible
runner also appends its output to `/var/log/aggregator-node-configure.log`.
The shared lock covers checkout, playbook and readiness checks. The
successful Git revision is recorded only after those checks pass.

This workflow never builds or publishes application images. Every
`deploy/demo` push enters a single ordering workflow; infrastructure changes
must pass Terraform/Ansible before the dispatch stage is reached.
Application changes perform a read-only Terraform Plan and an SSM fingerprint
check before proceeding to `demo-deploy`. They never run `tofu apply` without
changes in the reviewed plan and an approval.
The dispatch job holds `actions: write`, while the approved Terraform/SSM
job retains narrower permissions. A dispatched `demo-deploy` workflow
runs independently: infrastructure success does not imply application
deployment success. GitHub `workflow_dispatch` is available because
`demo-deploy.yml` exists on `main` (the repository default branch).

A push to `deploy/demo` is required before infrastructure can be applied;
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
at least 16 characters and no more than 72 UTF-8 bytes, without null bytes
or line breaks. Do not put plaintext or a password
fingerprint in Git, Terraform variables, state, or plan artifacts.

During an approved infrastructure Apply, the script
`deploy/argocd/sync-argocd-password.py` reads the bcrypt
verifier currently stored in the Kubernetes `argocd-secret` through
AWS SSM and checks the requested password with `bcrypt.checkpw`.
If it matches, the Secret stays unchanged. Otherwise the runner generates
a fresh bcrypt verifier with a random salt and sends only that verifier
through SSM to update `argocd-secret`. This does not require a separate
unsalted fingerprint or persistent comparison state.

### Rotate through GitHub Actions

1. Edit the Environment Secret `ARGOCD_PASSWORD` under
   **Settings → Environments → `demo-infra-apply`**.
2. Open **Actions → Demo pipeline → Run workflow** and select `deploy/demo`.
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
an eligible `deploy/demo` push is the available automatic trigger. Do not
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
    python deploy/argocd/sync-argocd-password.py
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
See [the Ansible README](ansible/README.md) for verification
and access details.

## GitHub setup (required before use)

Configure Repository and Environment variables under **Settings → Secrets and variables → Actions → Variables** and **Settings → Environments**:

| Type                           | Name                         | Meaning                                          |
| ------------------------------ | ---------------------------- | ------------------------------------------------ |
| Environment `demo-infra-plan`  | `AWS_ROLE_ARN`               | Plan role ARN from the admin OpenTofu outputs.   |
| Environment `demo-infra-plan`  | `ENABLE_K3S_NODE`            | Explicit `true` or `false`.                      |
| Environment `demo-infra-plan`  | `ENABLE_BEDROCK`             | Explicit `true` or `false`.                      |
| Environment `demo-infra-apply` | `AWS_ROLE_ARN`               | Apply role ARN from the admin OpenTofu outputs.  |
| Environment `demo-infra-apply` | `MANUAL_APPROVAL_CONFIGURED` | `true`, after Required reviewers are configured. |

In the **Environment secrets** section of `demo-infra-apply`, create
`ARGOCD_PASSWORD` with a strong password (at least 16 characters and at most
72 UTF-8 bytes).
The value is available only after required-reviewer approval and never
becomes an OpenTofu input. Keep it in the protected Environment, not
`demo-infra-plan` or repository-level secrets.

**Do not create AWS access-key secrets.** Existing GitHub OIDC provider is
reused. Both infrastructure IAM roles, their trust policies, and their
managed permission policies are defined as IaC in
[the admin OpenTofu root](../administration/README.md). Apply `infra/administration` first with
the authorized `infra-admin` identity and use its outputs for the GitHub
Environment-scoped `AWS_ROLE_ARN` values; do not create the roles manually.
The plan role's IAM trust now uses the subject `environment:demo-infra-plan`
instead of the legacy branch-bound OIDC subject; **apply admin again** before activating
this workflow. Each job resolves `AWS_ROLE_ARN` from its own Environment. The OIDC plan role must not
have infrastructure write privileges, because planning occurs **before**
manual approval. The existing `AggregatorDemoDeployGithub` role is
restricted to the old application deployment and is **not** reused.

Environment `demo-infra-plan` must allow only `deploy/demo` and have no Required
reviewers, so plan runs without manual confirmation.

GitHub Environment `demo-infra-apply` must be configured under
**Settings → Environments**:

1. Add **Required reviewers** (allow self-review if you intend to approve
   your own pushes; do not enable Prevent self-review in that case).
2. Allow deployments from **only the `deploy/demo` branch**.
3. Only after both rules are saved, set the Environment variable
   `MANUAL_APPROVAL_CONFIGURED=true`.

Do not set `MANUAL_APPROVAL_CONFIGURED` as a repository variable.
AWS planning runs automatically for demo infrastructure changes. Required-reviewer
rules in `demo-infra-apply` protect all changes to infrastructure and Ansible
configuration. Apply and Ansible share the same Environment approval.

GitHub `workflow_dispatch` generally requires a workflow file to exist on
the repository's default branch. Until this file is also present on `main`,
normal pushes to `deploy/demo` are the supported trigger. The manual
reapply input becomes useful once that requirement is met.

## Infrastructure flags and review risks

The workflow refuses missing `ENABLE_K3S_NODE` and
`ENABLE_BEDROCK` variables rather than silently selecting Terraform
defaults. Before activating this workflow, apply the two additional IAM
role policies in `infra/administration/ansible_config_state.tf` using
`infra-admin`. The planning role needs `ssm:GetParameter` for
`/aggregator/demo/ansible/last-successful-config-sha256`, and the approved
apply role needs `ssm:PutParameter` on the same path. The Standard String
parameter is created only after the first successful Ansible run.
An absent initial record deliberately requires approval and reconciliation;
do not invent or seed a success record without verified node configuration. **Setting `ENABLE_K3S_NODE=false` after creating the node
would plan its destruction.** Review the plan before approval.

No `K3S_BOOTSTRAP_GIT_REF` is needed. The workflow runs the precise
`github.sha` through SSM after apply. Changing the Ansible playbook alone
never changes EC2 `user_data`; cloud-init revisions intentionally require
a reviewed instance replacement.

The binary `demo.tfplan` may include sensitive infrastructure or state data
even when the rendered plan redacts it. **Never use public GitHub Actions
artifacts for saved plans.** The plan is stored in the private project-owned
S3 bucket `aggregator-project-tofu-state-905418096305-eu-central-1` under the
dedicated `plans/demo/` prefix. S3 Lifecycle expires current versions
after 7 days, noncurrent versions after one further day and removes expired
delete markers. S3 processing is asynchronous. If approval takes too long
and the plan is gone, create and approve a fresh plan instead.

The S3 bucket policy enforces conditional uploads (`If-None-Match: *`);
the unapproved plan role has only conditional `PutObject` for this prefix,
and the approved apply role has only `GetObject`. The plan job passes
its SHA-256 via GitHub job output; the apply job refuses mismatches.
Object keys include `github.run_id` and `github.run_attempt` so retries
cannot silently overwrite an earlier plan.

**Prerequisites:** complete the [state migration](../MIGRATE-STATE.md):
create protected Foundation/Administration buckets; migrate the privileged
administration state; apply project IAM delegation; create the project bucket
through `aggregator-admin`; and migrate demo/publication backends. The
plan lifecycle and conditional-write policy are owned by `infra/state`,
not by Foundation. Only then promote the updated workflow to `deploy/demo`.
The textual plan and review summary are still shown in public Actions
logs; continue treating those as public information. Approval must be based on the actual plan, not only the status of checks.

## Recovering from a partially applied infrastructure plan

OpenTofu can create some resources before a later AWS API operation fails.
A failed `tofu apply` is **not** a transaction rollback. Do not delete
the created K3s IAM role, instance profile, security group or rules manually.
Those resources are expected to remain in the demo state.

Before retrying a failure caused by `AccessDenied`:

1. Apply the `infra/administration` root with the authorized `infra-admin`
   identity. The `AggregatorDemoEC2Management` policy already includes
   `logs:TagResource` for the dedicated K3s SSM log group. The
   `AggregatorDemoIAMManagement` policy must also permit attaching the
   approved Bedrock model policy to the existing `AggregatorDemoEC2Role`
   when `ENABLE_BEDROCK=true`. Commits do not deploy these IAM policies.
2. Trigger **a fresh** `demo-infra-plan` job against the updated remote
   state. A subsequent reviewed push affecting `infra/demo/**` will
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
The role and SSM permissions are declared in `infra/administration` and
become available only after an approved OpenTofu apply of that root.
This demo workflow must not try to create or modify the admin root.

CloudWatch log permissions and the instance role boundary are defined in
`infra/administration`. Apply `infra/administration` before enabling K3s, then review and apply the demo
root through GitHub. The CloudWatch log group is created only if K3s is enabled.

To debug, inspect the plan/apply job summaries, CloudWatch SSM output, and
on-node `/var/log/cloud-init-output.log` or
`/var/log/aggregator-node-configure.log`.

## Public K3s application deployment

The new node is bootstrapped with K3s, bundled Traefik/ServiceLB and an
Argo CD Application following `deploy/demo-gitops:deploy/k8s-live`, containing only image
versions published after the corresponding GHCR build. See
[the K3s GitOps README](../../deploy/k8s/README.md) for prerequisites,
public HTTP-by-IP behaviour, image publication, rollback and limitations.
No DNS cutover is performed.
