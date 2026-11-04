# Publisher infrastructure

Two independent OpenTofu roots manage the Publisher:

| Root | AWS identity | Responsibility | State key |
| --- | --- | --- | --- |
| [`administration`](administration/README.md) | `administrator` | Scoped IAM permissions and role boundary | `projects/aggregator/publisher/tofu.tfstate` in the central administration bucket |
| [`resources`](resources/README.md) | `aggregator-admin` | S3, DynamoDB, Lambda, Scheduler, SNS, SQS, workload roles and Secrets Manager | `aggregator-publisher/tofu.tfstate` in the project state bucket |

Use the matching AWS identity, verify it with `aws sts get-caller-identity`,
and review `tofu plan` before applying. Both roots pin AWS Provider 6.41.0.
The Lambda archive is built from the Publisher root with
`python publisher.py build` before a workload deployment.

These roots are independent of the existing shared account administration
state. The runtime has a one-time compatibility gate for the preceding queue.

The failure-notification address is stored in Secrets Manager; the SNS
subscription is managed by the workload root. See
[`resources/README.md`](resources/README.md) for its state import procedure.

Publication plans and private operator notes are managed with the CLI, not
with OpenTofu.
