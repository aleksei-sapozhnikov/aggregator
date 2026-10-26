# GitHub OIDC bootstrap for demo infrastructure

**This is a manual IAM bootstrap reference, not a deployable OpenTofu root.**
The existing GitHub OIDC identity provider is reused. Do not add permanent
AWS access keys to GitHub.

The GitHub workflow needs two AWS IAM roles with different trust boundaries:

| Role | OIDC subject | Permissions |
| --- | --- | --- |
| `AggregatorDemoInfraPlanGithub` | `repo:aleksei-sapozhnikov/aggregator:ref:refs/heads/demo` | Read AWS demo configuration; read remote state and use state lock; no AWS infrastructure writes. |
| `AggregatorDemoInfraApplyGithub` | `repo:aleksei-sapozhnikov/aggregator:environment:demo-infra` | Apply changes for the `demo` OpenTofu root; run Ansible through SSM only on the dedicated K3s instance. |

The plan job has access to AWS *before* any approval. **Never give it the
write permissions granted to the apply role.** The apply role's subject
names the Environment, not a branch: GitHub Environment
`demo-infra` **must** limit deployment branches to `demo` and require
reviewers, or the IAM trust would be insufficiently restrictive.

## Role creation

Provision these roles using separately authorized IAM administration (the
shared `admin` infrastructure is outside this workflow's scope). Trust
policy templates:

- [plan-trust.json](plan-trust.json)
- [apply-trust.json](apply-trust.json)

The normal delegated `aggregator-admin` policy is intentionally insufficient
for creating unrestricted OIDC roles. Existing `infra-admin` management
policy also lists only the old GitHub deployment role by name. Creating
these new identities therefore requires an IAM administrator or a planned
change to the separately managed IAM infrastructure.

Attach the following **existing** policies, plus the extra policies below:

| Policy | Plan role | Apply role |
| --- | --- | --- |
| `AggregatorDemoStateAccess` (S3 demo state + lock only) | Yes | Yes |
| `AggregatorDemoEC2Management` | No | Yes |
| `AggregatorDemoIAMManagement` | No | Yes |
| `AggregatorDemoSGRuleCreation` | No | Yes |
| `AggregatorDemoSSMManagement` | No | Yes |
| [demo-read-policy.json](demo-read-policy.json) (read-only permissions for demo OpenTofu) | Yes | Yes |
| [k3s-run-command-policy.json](k3s-run-command-policy.json) | No | Yes |

The existing IAM policies are named in `deploy/infra/admin` and reference
AWS account `905418096305`. Create inline policies from the provided JSON
on the corresponding roles. The EC2 read operations are account-wide
`ec2:Describe*` because AWS Describe APIs often cannot be scoped to
individual resources; they do not grant changes.

The policy templates reflect the currently inspected demo root. IAM actions
and read requirements may need adjustment if the AWS provider or managed
resources change. Verify with a real `tofu plan` using the plan role and a
reviewed `tofu apply` using the apply role before relying on the workflow.

### SSM security

The apply role receives `ssm:SendCommand` for the AWS-managed
`AWS-RunShellScript` document, limited by EC2 tags to the named K3s node.
This is a powerful capability: the document can execute shell commands as
root on that instance. A dedicated fixed-purpose SSM document with a
validated commit-SHA parameter would further reduce risk. Do not grant
`SendCommand` on the currently serving Docker Compose instance.

## GitHub variables

Set repository **variables**, not secrets:

- `AWS_DEMO_INFRA_PLAN_ROLE_ARN` =
  `arn:aws:iam::905418096305:role/AggregatorDemoInfraPlanGithub`
- `AWS_DEMO_INFRA_APPLY_ROLE_ARN` =
  `arn:aws:iam::905418096305:role/AggregatorDemoInfraApplyGithub`

Make sure `DEMO_INFRA_WORKFLOW_ENABLED` remains disabled until both roles,
the `demo-infra` Environment reviewers, and the environment-specific
`MANUAL_APPROVAL_CONFIGURED=yes` variable are configured.
