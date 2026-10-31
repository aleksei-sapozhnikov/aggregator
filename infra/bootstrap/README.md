# AWS access administration

OpenTofu root for Aggregator IAM users, groups, policies, permissions boundaries,
and delegated access to the shared S3 state bucket. Workload roles belong to their respective stacks.
This directory contains project-specific administration for Aggregator,
not a global AWS-account administration root. Environment-specific EC2
resources and their workload roles belong to their environment stacks.
Account-wide shared resources are managed in `aws_foundation/aws_account`.

## Contents

`infra-admin` is an external operator managed exclusively by
`aws_foundation/bootstrap`. This root does not manage its IAM user,
group memberships, policies or attachments.

- `main.tf`: users, groups, and memberships.
- `permissions.tf`: group policy attachments.
- `policies.tf` and `policies/`: delegated permissions and workload boundaries.
- `github_demo_deploy.tf`: demo application deploy role trusting the shared GitHub OIDC provider.
- `github_demo_infra.tf`: OIDC plan/apply roles for demo infrastructure;
  existing managed policies are reused instead of duplicated.
- `plan_artifacts.tf`: isolated S3 permissions for private saved plans.
  The planning role can only conditionally upload new `plans/demo/*` objects,
  while the protected apply role can only download them. Neither permission
  grants access to additional OpenTofu state keys.
- `state.tf`: stable ARN of the shared state bucket managed by `aws_foundation/aws_account`.
- `state_access.tf`: workload access to state keys and lock files.
- `backend.tf`, `providers.tf`, `versions.tf`: state, AWS account, and tool versions.

## Project-owned OpenTofu state

The new Aggregator-owned bucket and its S3 security controls are defined in
`state_bucket.tf`. The migration is staged to avoid breaking any existing
OpenTofu roots: **all active backends still point to the old shared bucket**
until the first bucket creation and permissions migration are approved.
See [state migration procedure](MIGRATE-STATE.md) before applying or
switching any backend. The old bucket remains owned by
`aws_foundation/aws_account` because Foundation keeps its own state there.

## Usage

Use OpenTofu 1.12 or newer within the 1.x series and AWS credentials for
`infra-admin` or an equivalent administrative identity. Set `AWS_PROFILE` for
your shell, then run from this directory:

```sh
tofu init
tofu validate
tofu plan
```

The configured account is `905418096305`, region `eu-central-1`.
The S3 backend key deliberately remains `admin/tofu.tfstate` despite moving
this root to `infra/bootstrap`. The bucket and other shared account
infrastructure are managed separately by `aws_foundation/aws_account`.

## Checks

Use TFLint 0.65.0 with this directory's `.tflint.hcl`. These static checks
require no AWS credentials:

```sh
tofu fmt -check -recursive
tflint --init
tflint --recursive --config="$PWD/.tflint.hcl" --minimum-failure-severity=notice
```

## Operations

Review privilege changes before applying them. The `aggregator-admin` user
cannot administer this root or read its state. Demo and publication permissions
refer to AWS resource names and ARNs; they do not load files or state from other
roots.

Keep state, saved plans, variable values, and credentials out of Git.
Before running the updated demo workflow, apply `aws_foundation/aws_account`
as `infra-admin` to enable the private plan prefix's S3 Lifecycle and
conditional-write bucket policy. Then apply this `infra/bootstrap` root
to install the separate plan upload/download policies. Review both plans;
the workload's `demo/tofu.tfstate` object must not be moved or deleted.
Commit `.terraform.lock.hcl` to preserve provider selections.

## GitHub OIDC deploy identity

`github_demo_deploy.tf` creates the role
`AggregatorDemoDeployGithub`. It trusts the existing GitHub OIDC provider
owned by `aws_foundation/aws_account`. The role can only run the dedicated SSM
document on the tagged serving demo EC2 and read its result.

Apply this root using `infra-admin`. Set the resulting `github_demo_deploy_role_arn` output in the `demo`
GitHub environment variable `AWS_DEMO_DEPLOY_ROLE_ARN`.

**Important:** Restrict GitHub's `demo` environment to the `demo` branch.
OIDC environment subjects do not independently enforce branch restrictions.
Older repositories typically use the legacy name-based subject; adjust the
trust subject if immutable OIDC claims have been explicitly enabled.

## Demo infrastructure GitHub OIDC roles

The two infrastructure roles and their attachments are defined in
`github_demo_infra.tf`:

- `AggregatorDemoInfraPlanGithub` can read demo infrastructure and state
  and write/delete only its OpenTofu lock file.
- `AggregatorDemoInfraApplyGithub` runs after GitHub Environment
  `demo-infra-apply` approval. It reuses the existing
  `AggregatorDemoStateAccess`, `AggregatorDemoEC2Management`,
  `AggregatorDemoIAMManagement`, `AggregatorDemoSGRuleCreation` and
  `AggregatorDemoSSMManagement` policies.

The additional plan-only state access, resource reads and K3s Run Command
permissions are defined in `policies/`. No manual IAM role creation is
required. Apply this administrative root first with the authorized
`infra-admin` identity, then configure `AWS_ROLE_ARN` in both GitHub Environments:
`demo-infra-plan` receives the plan role ARN; `demo-infra-apply` receives the apply
role ARN. The first Environment requires no approval but must allow only the
`demo` branch. The second requires approval and also allows only `demo`. The roles are not applied merely by committing these files.

When enabling K3s, apply changes to the admin root **before** the demo root.
This includes `logs:TagResource` on
`/aws/ssm/aggregator-demo-k3s` in `AggregatorDemoEC2Management`, and the
narrowly scoped SSM/Bedrock policy attachments allowed on the existing
`AggregatorDemoEC2Role` in `AggregatorDemoIAMManagement`. A successful
GitHub infrastructure plan cannot install missing IAM permissions by itself.
After an AccessDenied failure, create a fresh demo plan based on the updated
state; do not apply the original artifact again.

The existing `AggregatorDemoDeployGithub` role is intentionally separate:
it is limited to serving-demo application deployment. Workload EC2 IAM
roles and instance profiles remain in `demo`, since they belong to the
corresponding EC2 instances.

## Demo SSM document management permission

`AggregatorDemoSSMManagement` grants the `AggregatorDemoAdmins` group
document lifecycle permissions scoped to `AggregatorDemoDeploy` only.
Creation requires the `Project=aggregator` and `Environment=demo` request
tags. Other SSM documents and Run Command execution permissions are not granted.

Apply this IAM change as `infra-admin` before retrying
`deploy/infra/demo` as `aggregator-admin`. The latter already has its
EC2 `AmazonSSMManagedInstanceCore` attachment from the previous partial apply.

## Browser access without inbound SSH

The `AggregatorDemoSessionAccess` policy allows members of
`AggregatorDemoAdmins` to open an interactive AWS Systems Manager
Session Manager shell only on the tagged `demo-aggregator` or future
`aggregator-demo-k3s` instances. The permitted session document is
`SSM-SessionManagerRunShell`; users can resume or terminate only
their own sessions. For direct IAM users, Session Manager uses the username
in session ARNs; `aws:username` must therefore be permitted for session
termination and resume. The policy also retains `aws:userid` for
Session Manager data-channel compatibility.

The IAM user `aggregator-admin` is tagged `SSMSessionRunAs=ec2-user`.
Regional Run As preferences are managed by `aws_foundation/aws_account`.
Session preferences apply to every managed instance in the selected account
and region. The IAM tag takes priority over the account default OS user.

Test `whoami` and `id -u` in the browser shell. The expected user is
`ec2-user` with a nonzero UID. This is not a strict privilege separation:
`ec2-user` usually has sudo access and the serving demo user has Docker
access. The regional session document is managed by `aws_foundation/aws_account` with
explicit settings for session logging, encryption, and timeouts.

Apply this root as `infra-admin`, then sign in to AWS as
`aggregator-admin` and select EC2 > Instances > demo-aggregator >
Connect > **Session Manager** > Connect. Do not use the EC2 Instance
Connect tab: it requires SSH, and the demo security group has closed
TCP/22. A successfully executed SSM Run Command does not grant the
console user interactive Session Manager access.

The serving EC2 and future k3s module do not specify SSH key pairs
or expose TCP/22. Administrative access uses Session Manager.

## Regional Session Manager preferences

The account-wide `SSM-SessionManagerRunShell` document is owned by
`aws_foundation/aws_account`. Do not reintroduce it as a managed resource here.

## Argo CD private dashboard

The demo administrator policy `AggregatorDemoSessionAccess` also permits
the AWS-owned `AWS-StartPortForwardingSession` document on tagged K3s
instances. Apply the admin root as `infra-admin` before attempting the
one-command local Argo CD tunnel. The password is stored **only** in the
protected GitHub Environment `demo-infra-apply`, not in AWS Secrets Manager
or this OpenTofu root. No new Secrets Manager permissions are needed.
