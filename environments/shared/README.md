# AWS infrastructure ownership

Account-wide resources live in [aws_foundation](https://github.com/aleksei-sapozhnikov/aws_foundation).
This repository owns project IAM and workloads.

| OpenTofu root                                      | Operator                                | Responsibility                                          | State key                                                          |
| -------------------------------------------------- | --------------------------------------- | ------------------------------------------------------- | ------------------------------------------------------------------ |
| [shared/infra/administration](infra/administration/) | `infra-admin`                           | Project IAM, GitHub OIDC roles, delegated permissions | `projects/aggregator/tofu.tfstate` (central Administration bucket)  |
| [shared/infra/state](infra/state/)                  | `aggregator-admin`                      | Project S3 state bucket and saved-plan lifecycle      | `state/tofu.tfstate`                                                |
| [demo/infra](../demo/infra/)            | `aggregator-admin` / approved OIDC role | Serving Compose EC2, optional K3s EC2 and SSM documents | `demo/tofu.tfstate`                                                 |
| [tools/publisher/infra](../../tools/publisher/infra/) | `aggregator-admin`                      | Publication automation                                | `publication/tofu.tfstate`                                          |

The central Administration bucket is `aws-administration-state-905418096305-eu-central-1`.
Workload state and private demo plans use `aggregator-project-tofu-state-905418096305-eu-central-1`.
AWS account: `905418096305`; region: `eu-central-1`.

Apply project IAM only as `infra-admin`. Apply workload roots using their delegated
identities. Keep IAM and workload states separate, inspect every plan, and never
commit state files, plans or credentials. See the root-specific READMEs for
commands and deployment safeguards.
