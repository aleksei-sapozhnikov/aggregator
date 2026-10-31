# Aggregator AWS administration

Project-specific IAM users, groups, permissions boundaries, GitHub OIDC roles,
and delegation to `aggregator-admin`. This OpenTofu root lives in the
Aggregator repository but is executed **only by the central AWS administrator**,
currently IAM user `infra-admin`. Foundation does not contain project IAM.

Its state is stored in the Foundation-created, administrator-only bucket
`aws-administration-state-905418096305-eu-central-1` at
`aggregator/tofu.tfstate`. The delegated `aggregator-admin` cannot
read, update or destroy this privileged state.

The shared GitHub OIDC provider and SSM session preferences belong to
`aws_foundation/aws_account`; project GitHub roles remain here.

## Owned resources

- `main.tf`: existing `aggregator-admin`, groups, membership.
- `permissions.tf`, `policies.tf`, `policies/`: managed policies and
  attachments, including tightly scoped project-state bucket provisioning.
- `github_demo_*.tf`: repository-specific OIDC plan/apply/deploy roles.
- `state_access.tf`: demo/publication backend permissions. Old-bucket
  permissions remain **temporarily** for state migration.
- `plan_artifacts.tf`: separate plan-upload and approved-plan-read grants.
- `project_state_bucket_management.tf`: allows the delegated project admin
  to create and maintain its bucket. The bucket resource itself is in
  `../state/`, never in this administration root.

## State migration and usage

**Before using the changed backend or applying IAM**, follow the ordered
[transition runbook](../MIGRATE-STATE.md). The existing administration
resources retain their OpenTofu addresses and physical IAM names despite
the directory move from `infra/bootstrap`.

After migration, with the central operator's credentials:

```sh
tofu init
tofu validate
tofu plan
```

Do not approve any replacement of existing IAM identities. The new
project-state bucket is owned by `aggregator-admin`, so this root must
not create or import `aws_s3_bucket.aggregator_state`.

Read/write state grants on the **legacy** bucket are intentionally retained
only until demo/publication migrations are verified. Remove them in a
separate follow-up IAM change; do not retire the old bucket while the
workflow or other operators still use it.

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
`infra/demo` as `aggregator-admin`. The latter already has its
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
