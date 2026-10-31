# AWS workload infrastructure

OpenTofu roots are managed independently. The shared AWS account foundation
is maintained in [aws_foundation](https://github.com/aleksei-sapozhnikov/aws_foundation).

- [Project IAM bootstrap](../../infra/bootstrap/): Aggregator IAM users,
  groups, policies, permission boundaries, and GitHub OIDC roles. Run with
  `infra-admin`. Its existing S3 key remains `admin/tofu.tfstate`.
- [Demo](demo/): EC2 demo, workload IAM resources, network infrastructure and
  optional K3s with Ansible (`demo/tofu.tfstate`).
- [Publication](publication/): Lambda publication runner and supporting
  cloud resources (`publication/tofu.tfstate`).

The shared S3 bucket, account GitHub OIDC provider and regional Session Manager
preferences are owned by `aws_foundation/account`. Root-only administration
of the `infra-admin` user is owned by `aws_foundation/bootstrap`.

## Safe operations

Apply project IAM changes through `infra/bootstrap` before relying on new
permissions from `demo` or `publication`. Review all plans before applying.
Do not rename IAM identities, buckets or S3 state keys as part of source-layout
changes. The two workload roots continue using their existing backend keys.

Application deployments, Lambda code releases and GitHub publication schedules
have separate execution paths. Secrets, state, saved plans and credentials must
not be committed to Git.

See the corresponding root README files for detailed operating instructions.
