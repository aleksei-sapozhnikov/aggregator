# AWS foundation extraction

## Status

The account-level infrastructure was separated from Aggregator on
October 31, 2026. Existing AWS resources were transferred between OpenTofu
states without deleting or recreating them. Live ownership and configuration
were checked using clean `tofu plan` results after the migration.

## Ownership

| OpenTofu root | Managed infrastructure | State |
| --- | --- | --- |
| `aws_foundation/bootstrap` | Shared `infra-admin` IAM user, `AdministratorAccess` attachment, protected root-only S3 bucket | `foundation/bootstrap/tofu.tfstate` in its dedicated bucket |
| `aws_foundation/account` | Shared state S3 bucket and policy, GitHub OIDC provider, regional Session Manager document | `foundation/account/tofu.tfstate` in the shared bucket |
| `aggregator/infra/bootstrap` | Project-specific `aggregator-admin`, Aggregator IAM groups, policies and GitHub OIDC roles | Existing `admin/tofu.tfstate` in the shared bucket |
| `aggregator/infra/demo` | Demo cloud infrastructure | Existing `demo/tofu.tfstate` |
| `aggregator/deploy/infra/publication` | Publication runner cloud infrastructure | Existing `publication/tofu.tfstate` |

No IAM identities, AWS object names or S3 state keys were renamed during the
ownership transfer. The demo OpenTofu root was relocated from `deploy/infra/demo` to
`infra/demo` with the same backend key `demo/tofu.tfstate` and unchanged module
addresses. Ansible now lives in `infra/demo/ansible`. A temporary compatibility
symlink was used during relocation and retired when the K3s EC2 cloud-init
was simplified for a planned replacement.
The project-specific IAM root was previously relocated
in source control from `deploy/infra/admin` to `infra/bootstrap` without
moving its S3 state.

## Access boundaries

- AWS root operates only `aws_foundation/bootstrap` through OpenTofu.
- `infra-admin` has `AdministratorAccess` and manages
  `aws_foundation/account` and Aggregator project IAM.
- `aggregator-admin` retains narrowly delegated permissions for project
  workloads and is denied access to the shared bucket's `admin/*` and
  `foundation/*` object prefixes.
- The dedicated bootstrap state bucket policy explicitly denies non-root
  principal access. The shared bucket and bootstrap bucket are separate.

The project bootstrap no longer manages the `infra-admin` user's group
membership. Its former Aggregator-only infrastructure administrators group,
policy and attachments have been retired. The user retains
`AdministratorAccess` from `aws_foundation/bootstrap`.

Before applying this cleanup, confirm `AggregatorInfrastructureAdmins` has
no members other than `infra-admin`, and review the OpenTofu destroy plan.
No `infra-admin` IAM user or direct policy attachment is to be deleted.

## Operational precautions

Review `tofu plan` before each apply. Do not add the same existing AWS object
to two states, alter protected state keys, or manually create AWS resources.
All resource creation and modification should be performed through OpenTofu.
Keep state, saved plans, credentials and private backend config out of Git.
