# Aggregator demo infrastructure (OpenTofu)

This directory is an independent OpenTofu root with its own state. Always run
OpenTofu commands from `deploy/infra/demo`, **not** `deploy/infra`.
The shared EC2 modules live in `../modules/`.

| Module | Intended use |
| --- | --- |
| `../modules/ec2_legacy/` | Existing imported Docker Compose demo instance. Preserves imported-resource behavior. |
| `../modules/ec2_k3s/` | New instance only. Enforces tagging, encrypted storage, and a role permissions boundary. |

## Existing demo and state

The existing instance is tracked as `module.aggregator_demo`. Its module source
changed to `../modules/ec2_legacy`, but its resource addresses did **not** change.
Do not re-import the instance or move its state for this refactor.

From the repository root:

```powershell
cd deploy/infra/demo
tofu init
tofu validate
tofu plan
```

Do not apply a plan that would replace the legacy instance or remove its tags.

## Bedrock managed policy ownership migration

`AggregatorCallBedrockModel` was originally created by
`module.permissions.aws_iam_policy.bedrock` in this demo state. Its new owner
will be `aws_iam_policy.bedrock_model` in `../admin`.

The `removed` block in `main.tf` explicitly uses `destroy = false`.
Applying it **forgets** `module.permissions` in demo state but does not delete
the policy from AWS. This migration requires OpenTofu 1.10 or newer.

Complete the migration in this order, and do not run either state concurrently:

1. Back up both state files somewhere private and outside Git.
2. In this directory, run `tofu plan` and confirm that the only operation is
   forgetting `module.permissions.aws_iam_policy.bedrock`, **not** destroying it.
3. Apply the reviewed demo plan. Confirm that the policy remains in AWS and
   `tofu plan` now reports `No changes`.
4. In `../admin`, run the read-only snapshot generator with
   `--include-bedrock`, review the generated JSON and HCL, and plan an
   import of `aws_iam_policy.bedrock_model`.
5. Apply the admin import only when it proposes no creations, updates, or
   deletions. Confirm `No changes` in **both** roots.
6. Commit the generated `admin/policies/AggregatorCallBedrockModel.json`,
   `admin/policies.tf`, `admin/imports.tf` and
   `admin/snapshot-summary.json`.

See `../admin/README.md` for detailed PowerShell commands.

The Bedrock policy's ARN is stable and is referenced directly by the legacy
module (if enabled) and the new k3s module. Never allow the same remote IAM
policy to be managed by two OpenTofu states.

## New k3s instance contract

The `ec2_k3s` module intentionally has no imported-resource overrides:

- Uses fixed names for the demo k3s node and related infrastructure.
- Requires `Project=aggregator`, `Environment=demo`, `ManagedBy=terraform`,
  and `Component=k3s` on taggable resources, including root EBS at launch.
- Requires a verified Amazon-owned AL2023 x86_64 AMI, pinned at the call site.
- Uses encrypted gp3 storage, IMDSv2, and a restricted IAM role with
  `AggregatorDemoRoleBoundary`, Bedrock, and SSM policies.
- Opens public HTTP/HTTPS only. SSH is disabled by default; port 6443 is not
  opened to the Internet.
- Reuses the account's default VPC and a public default subnet, but does not
  manage their lifecycle.
- Provisions only the EC2 infrastructure, not Kubernetes. Ansible and k3s setup
  are separate steps.

The k3s module is currently commented out in `main.tf`. To recreate it,
uncomment the existing `module "aggregator_demo_k3s"` block, verify the
selected AL2023 AMI, and run `tofu plan` from `deploy/infra/demo`.
Only apply after reviewing that the plan creates **new k3s resources** and
does not modify `module.aggregator_demo`.

## Access and Terraform state

The regular provisioning identity is `aggregator-admin`; administrative
IAM policies and permissions boundaries are managed separately by the
`../admin` root with privileged credentials.

The demo state currently uses a local backend:
`../../../.temp/demo/demo-infra.tfstate` relative to this directory.
Do not commit state, plan files, or credentials to Git.
