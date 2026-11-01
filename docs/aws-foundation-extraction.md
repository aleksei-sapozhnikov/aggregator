# AWS Foundation extraction and subsequent state separation

## Previously completed

On October 31, 2026, account-wide GitHub OIDC, Session Manager settings
and shared S3 configuration were separated into
`aws_foundation/administration/aws_account`. The Foundation state key was subsequently
renamed to `foundation/aws_account/tofu.tfstate` in the original bucket,
without changing the bucket or destroying resources.

The demo root was previously relocated to `infra/demo` while keeping
its resource addresses and `demo/tofu.tfstate` key.

## New architecture — staged, not yet applied in AWS

| Root                                        | Ownership                                 | Intended state                                                             |
| ------------------------------------------- | ----------------------------------------- | -------------------------------------------------------------------------- |
| `aws_foundation/foundation`                 | AWS root                                  | Existing root-protected Foundation state bucket, `foundation/tofu.tfstate` |
| `aws_foundation/administration/aws_account` | Central `infra-admin`                     | Administration bucket, `aws_account/tofu.tfstate`                          |
| `aggregator/infra/administration`           | Central `infra-admin`, code in Aggregator | Protected Administration bucket, `projects/aggregator/tofu.tfstate`        |
| `aggregator/infra/state`                    | Delegated `aggregator-admin`              | Project bucket, `state/tofu.tfstate`                                       |
| `aggregator/infra/demo`                     | Delegated / approved OIDC                 | Project bucket, `demo/tofu.tfstate`                                        |
| `aggregator/deploy/infra/publication`       | Delegated `aggregator-admin`              | Project bucket, `publication/tofu.tfstate`                                 |

The account-wide OIDC provider is reused by project GitHub roles; the
roles and all Aggregator-specific IAM users/policies live only in
`aggregator/infra/administration`. The central Administrator identity
is presently named `infra-admin`; the IAM user is _not_ renamed
automatically by these changes.

The original shared bucket is retained intact for migration and for
historical privileged state versions. The account Administration root's `removed`
blocks deliberately **forget** it rather than destroy it; S3 historical
cleanup is a separate, security-sensitive decision.

The current `dev` source definitions are not proof of AWS migration.
Follow [the ordered migration runbook](../infra/MIGRATE-STATE.md)
before applying IAM changes, state backends or GitHub CI changes.

## Security

AWS root controls only the root-protected Foundation root. The central
administrator can change account-level infrastructure and project IAM;
the delegated project admin can change its own workload resources
and S3 state bucket, but cannot read central administrative state.
Never track one AWS resource in two OpenTofu states, and never apply
a plan that proposes recreation of the existing IAM user or the
serving Docker Compose EC2 instance.
