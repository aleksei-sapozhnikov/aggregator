# Publication AWS infrastructure

OpenTofu root for the scheduled GitHub publication system. It owns Lambda,
its IAM roles, DynamoDB state, publication-data S3 storage, Scheduler
and watchdog, CloudWatch logs, and failure notifications. It **does not**
own the Lambda code release or the scheduled queue contents.

## Plan infrastructure changes

Use an AWS identity authorized to administer the project (for example
`aggregator-admin`) in account `905418096305`, region `eu-central-1`.
OpenTofu 1.12+ is required. From this directory:

```sh
aws sts get-caller-identity
tofu init -input=false -lockfile=readonly
tofu validate
tofu plan
```

Inspect every plan before applying it, especially IAM, state resources,
schedule changes, and notifications. The existing backend stores state
at `publication/tofu.tfstate`. The state bucket, permission boundary,
and Lambda bootstrap code object must already exist. Do not initialize
empty replacement state.

Lambda code releases are managed independently to avoid a routine
infrastructure plan overwriting running code. Use
[operator tools](tools/README.md) to build, preview and explicitly deploy
a code update; `--apply` requires confirmation. The watchdog normally
checks the queue every 15 minutes; the Lambda environment controls
activation and notifications.

Tokens belong in Secrets Manager, not Terraform variables. The SNS email
endpoint is also sourced from a secret, but the provider can persist that
endpoint in state and saved plans: treat those artifacts as sensitive.

For infrastructure formatting and linting, use the repository's TFLint
configuration and [Code QA](../../code_qa/README.md). Keep
`.terraform.lock.hcl` committed, but never commit plans, state files,
credentials, or downloaded Lambda ZIPs.
