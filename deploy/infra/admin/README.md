# AWS access administration

OpenTofu root for shared IAM users, groups, policies, permissions boundaries,
and S3 state storage. Workload roles belong to their respective stacks.
This directory can be used as a standalone repository.

## Contents

- `main.tf`: users, groups, and memberships.
- `permissions.tf`: group policy attachments.
- `policies.tf` and `policies/`: delegated permissions and workload boundaries.
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
For this tag to take effect, enable **Run As support for Linux instances**
under Systems Manager > Session Manager > Preferences in `eu-central-1`.
Keep existing logging, encryption, and timeout preferences unchanged.
Session preferences apply to every managed instance in the selected account
and region. The IAM tag has priority over the account default OS user.

Test `whoami` and `id -u` in the browser shell. The expected user is
`ec2-user` with a nonzero UID. This is not a strict privilege separation:
`ec2-user` usually has sudo access and the serving demo user has Docker
access. Do not overwrite `SSM-SessionManagerRunShell` from this stack;
it might contain existing account-wide logging or encryption settings.

Apply this root as `infra-admin`, then sign in to AWS as
`aggregator-admin` and select EC2 > Instances > demo-aggregator >
Connect > **Session Manager** > Connect. Do not use the EC2 Instance
Connect tab: it requires SSH, and the demo security group has closed
TCP/22. A successfully executed SSM Run Command does not grant the
console user interactive Session Manager access.

The original EC2 key pairs were deleted manually. Keep the serving EC2
`key_name` field unchanged: clearing it in Terraform may replace the
instance, and it has no effect on Session Manager. The future k3s
module uses no EC2 key pair or SSH ingress.

## Regional Session Manager Run As preferences

The `infra-admin` group may create or update **only**
`SSM-SessionManagerRunShell` in `eu-central-1`. This account-level
document may already exist with logging and encryption preferences;
review and preserve them rather than recreating or overwriting it.

After applying the admin OpenTofu stack, sign into AWS as `infra-admin`:
Systems Manager > Session Manager > Preferences > Edit > enable **Run As
support for Linux instances**. Preserve existing logging, encryption,
timeouts and optional fallback OS user. The `aggregator-admin` IAM tag
`SSMSessionRunAs=ec2-user` determines the shell identity on the serving
and future k3s instances; it overrides the account fallback OS user.

If Run As is enabled without a fallback OS user, IAM identities without
a valid `SSMSessionRunAs` tag can no longer start interactive sessions.
This is an intentional account-level change that should be reviewed
before saving. Test as `aggregator-admin` in a new browser session.
