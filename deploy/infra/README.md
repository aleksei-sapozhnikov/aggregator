# AWS workload infrastructure

The AWS-account foundation is maintained separately in
[aws_foundation](https://github.com/aleksei-sapozhnikov/aws_foundation).
Project-specific IAM administration remains **in this repository**.

| Root                                                  | Operator                              | Purpose                                                                                             |
| ----------------------------------------------------- | ------------------------------------- | --------------------------------------------------------------------------------------------------- |
| [`infra/administration`](../../infra/administration/) | `infra-admin` (central administrator) | Creates `aggregator-admin`, groups, policies, and GitHub OIDC roles; protected administration state |
| [`infra/state`](../../infra/state/)                   | `aggregator-admin`                    | Project-owned S3 bucket with lifecycle for sensitive saved plans                                    |
| [`infra/demo`](../../infra/demo/)                     | Delegated user / approved OIDC        | Demo EC2 and K3s; project-owned `demo/tofu.tfstate`                                                 |
| [`deploy/infra/publication`](publication/)            | `aggregator-admin`                    | Publication runner; project-owned `publication/tofu.tfstate`                                        |

Only account-wide GitHub OIDC provider and Session Manager preferences live
in Foundation. `infra/administration` runs using centrally granted rights
but is versioned next to the Aggregator workloads. Its S3 state key is
`projects/aggregator/tofu.tfstate` in the central Administration state bucket,
which is inaccessible to `aggregator-admin`.

**Migration is staged.** Do not initialize the changed backends against
empty destinations, and do not promote the new demo workflow until the
ordered [state migration runbook](../../infra/MIGRATE-STATE.md) has been
completed and validated.

Never commit credentials, saved plans or OpenTofu state. Existing
application deployment and publication schedules have independent release
paths; protect the running legacy demo while migrating.
