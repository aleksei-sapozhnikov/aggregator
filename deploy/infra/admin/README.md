# AWS access administration

OpenTofu root for shared IAM users, groups, policies, permissions boundaries,
and S3 state storage. Workload roles belong to their respective stacks.
This directory contains shared administration for the Aggregator project,
not a global AWS-account administration root. Environment-specific EC2
resources and their workload roles belong to their environment stacks.
This directory can be used as a standalone repository.

## Contents

- `main.tf`: users, groups, and memberships.
- `permissions.tf`: group policy attachments.
- `policies.tf` and `policies/`: delegated permissions and workload boundaries.
- `github_demo_deploy.tf`: the shared GitHub OIDC provider and demo application deploy role.
- `github_demo_infra.tf`: OIDC plan/apply roles for demo infrastructure;
  existing managed policies are reused instead of duplicated.
- `session_manager.tf`: regional Session Manager settings for interactive shells.
- `state.tf`: protected, encrypted, versioned S3 state bucket.
- `state_access.tf`: workload access to state keys and lock files.
- `backend.tf`, `providers.tf`, `versions.tf`: state, AWS account, and tool versions.

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
State is stored under `admin/tofu.tfstate`. The backend bucket must exist
before initialization.

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
Commit `.terraform.lock.hcl` to preserve provider selections.

## GitHub OIDC deploy identity

`github_demo_deploy.tf` creates the GitHub OIDC provider and role
`AggregatorDemoDeployGithub`. The role can only run the dedicated SSM
document on the tagged serving demo EC2 and read its result.

Apply this root using an administrator who can create the OIDC provider and
role. If an OIDC provider already exists, import it into
`aws_iam_openid_connect_provider.github_actions` before applying.
Set the resulting `github_demo_deploy_role_arn` output in the `demo`
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
their own sessions.

The IAM user `aggregator-admin` is tagged `SSMSessionRunAs=ec2-user`.
Regional Run As preferences are defined directly in
`session_manager.tf`.
Session preferences apply to every managed instance in the selected account
and region. The IAM tag takes priority over the account default OS user.

Test `whoami` and `id -u` in the browser shell. The expected user is
`ec2-user` with a nonzero UID. This is not a strict privilege separation:
`ec2-user` usually has sudo access and the serving demo user has Docker
access. The session document is managed in this root with explicit settings for
session logging, encryption, and timeouts.

Apply this root as `infra-admin`, then sign in to AWS as
`aggregator-admin` and select EC2 > Instances > demo-aggregator >
Connect > **Session Manager** > Connect. Do not use the EC2 Instance
Connect tab: it requires SSH, and the demo security group has closed
TCP/22. A successfully executed SSM Run Command does not grant the
console user interactive Session Manager access.

The serving EC2 and future k3s module do not specify SSH key pairs
or expose TCP/22. Administrative access uses Session Manager.

## Regional Session Manager preferences

`session_manager.tf` owns the regional
`SSM-SessionManagerRunShell` document and declares its full contents
inline. Run As is enabled for IAM identities tagged with
`SSMSessionRunAs`. Existing documents must be imported once before
OpenTofu can manage them. Review `tofu plan` before applying any
change to account-wide session preferences.

## Argo CD administrator access

Apply this admin root **before K3s provisioning**. It gives the EC2
permissions boundary narrowly scoped `secretsmanager:GetSecretValue`
for `aggregator/demo/argocd-admin`, allows the demo administrators to
use Session Manager local port forwarding, and attaches
`AggregatorDemoArgoCDSecretManagement` to the `AggregatorDemoAdmins`
group.

The `aggregator-admin` identity can then create the plain-text secret
`aggregator/demo/argocd-admin` in AWS Secrets Manager and update its
value. On creation, specify the tags `Project=aggregator` and
`Environment=demo`; the scoped IAM policy requires both request tags.
The demo administrators can change the secret value but cannot list or
modify unrelated passwords with this policy.

Secret *contents* are never created by OpenTofu, stored in its state,
passed to GitHub Actions, or printed in logs. This root provisions only
the IAM boundaries and permissions; the one-time secret value is entered
directly in AWS Secrets Manager.
