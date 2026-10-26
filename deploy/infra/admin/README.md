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
