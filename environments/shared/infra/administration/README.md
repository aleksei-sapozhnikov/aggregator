# Aggregator IAM administration

This OpenTofu root owns **project-specific IAM**: `aggregator-admin` and its
groups, scoped managed policies, permissions boundaries, and GitHub OIDC
deployment roles. It is operated **only by `infra-admin`**, not by
`aggregator-admin`. The account-wide OIDC provider and Session Manager
preferences are owned by [aws_foundation](https://github.com/aleksei-sapozhnikov/aws_foundation).

State is in the protected central bucket
`aws-administration-state-905418096305-eu-central-1` at
`projects/aggregator/tofu.tfstate`. Delegated project identities cannot
access this state.

## Apply changes

From `environments/shared/infra/administration` with authorized central credentials:

```sh
aws sts get-caller-identity
tofu init -input=false -lockfile=readonly
tofu validate
tofu plan
# Review the complete plan before tofu apply.
```

The account must be `905418096305` in `eu-central-1`. Never approve
replacement/deletion of existing IAM users, groups, trust providers, or state
buckets without a separate, deliberate plan.

## Demo GitHub roles

| Role                             | GitHub Environment | Purpose                                                                            |
| -------------------------------- | ------------------ | ---------------------------------------------------------------------------------- |
| `AggregatorDemoInfraPlanGithub`  | `demo-infra-plan`  | Read-only planning and private plan upload                                         |
| `AggregatorDemoInfraApplyGithub` | `demo-infra-apply` | Reviewed infrastructure changes, K3s SSM configuration and password reconciliation |

GitHub OIDC trust uses Environment subjects; restrict the two GitHub
Environments to `deploy/demo`. Only `demo-infra-apply` requires
reviewers and `MANUAL_APPROVAL_CONFIGURED=true`. Set `AWS_ROLE_ARN` from
the corresponding OpenTofu outputs. Use GitHub OIDC, not AWS access keys.

The public demo runs on K3s. Apply IAM changes through this administration
root before changes to infrastructure that depend on new permissions.
Never reuse an old saved OpenTofu plan after a partial apply.

## Permission boundaries

- `policies/` contains scoped demo compute, IAM, SSM, Session Manager and
  publication permissions. IAM roles/instance profiles attached to EC2
  workloads are managed in `environments/demo/infra`.
- Plan and apply roles use different policies for the SSM parameter
  `/aggregator/demo/ansible/last-successful-config-sha256`.
- `AggregatorDemoSessionAccess` permits interactive Session Manager and
  private Argo CD port-forwarding on tagged instances. The IAM user
  `aggregator-admin` runs as `ec2-user`. No inbound SSH is required.
- Project state bucket provisioning is delegated to `aggregator-admin`;
  the bucket itself belongs to `environments/shared/infra/state`.

State access in this root is restricted to the project-owned bucket.
Removing an unused S3 bucket is a separate, explicitly reviewed AWS action:
verify active backends, object versions and lock files first.

For the approval workflow and troubleshooting, see [Demo pipeline](../../../demo/WORKFLOW.md).
