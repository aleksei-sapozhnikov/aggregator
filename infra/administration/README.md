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

From `infra/administration` with authorized central credentials:

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

| Role                             | GitHub Environment | Allowed actions                                                                                                         |
| -------------------------------- | ------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| `AggregatorDemoInfraPlanGithub`  | `demo-infra-plan`  | Read demo state/resources, manage its lock, conditionally upload a private plan, read the SSM configuration fingerprint |
| `AggregatorDemoInfraApplyGithub` | `demo-infra-apply` | Approved demo apply, read exact saved plan, run K3s configuration through SSM, record successful fingerprint            |
| `AggregatorDemoDeployGithub`     | `demo`             | Run `AggregatorDemoDeploy` SSM document on the tagged serving Compose instance and read its result                      |

GitHub OIDC trust uses **Environment subjects**; it does not enforce branch
restrictions. In GitHub Settings → Environments, restrict all three
environments to `deploy/demo`. The plan environment must not require reviewers.
The apply environment **must require reviewers** and set
`MANUAL_APPROVAL_CONFIGURED=true` only after that protection is configured.

Populate `AWS_ROLE_ARN` in each infrastructure environment from this root's
outputs and `AWS_DEMO_DEPLOY_ROLE_ARN` in `demo`. Use OIDC, not stored AWS keys.
The infrastructure workflow never applies this administrator root.

## Permission boundaries

- `policies/` contains scoped demo compute, IAM, SSM, Session Manager and
  publication permissions. IAM roles/instance profiles attached to EC2
  workloads are managed in `infra/demo`.
- Plan and apply roles use different policies for the SSM parameter
  `/aggregator/demo/ansible/last-successful-config-sha256`.
- `AggregatorDemoSessionAccess` permits interactive Session Manager and
  private Argo CD port-forwarding on tagged instances. The IAM user
  `aggregator-admin` runs as `ec2-user`. No inbound SSH is required.
- Project state bucket provisioning is delegated to `aggregator-admin`;
  the bucket itself belongs to `infra/state`.

State access in this root is restricted to the project-owned bucket.
Removing an unused S3 bucket is a separate, explicitly reviewed AWS action:
verify active backends, object versions and lock files first.

For the approval workflow and troubleshooting, see [Demo pipeline](../demo/WORKFLOW.md).
