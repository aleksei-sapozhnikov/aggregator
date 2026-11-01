# Publication infrastructure

OpenTofu root for scheduled GitHub publication on AWS.
It owns Lambda, execution roles, DynamoDB queue state, S3 snapshots, the Scheduler
group and watchdog, and failure notifications. The Lambda runtime is maintained separately under `../lambda_publisher/`.

## Contents

- `main.tf`: resource names and Lambda configuration.
- `iam.tf`, `storage.tf`, `scheduler.tf`: execution permissions, data, and scheduling.
- `notifications.tf`, `secrets.tf`: alerts, logs, and secret containers.
- `outputs.tf`: resource identifiers for publication operators.
- `backend.tf`, `providers.tf`, `versions.tf`: state, AWS account, and tool versions.
- [`../lambda_publisher/`](../lambda_publisher/): Lambda runtime with its own source tree and tests.
- `tools/`: local packaging, release, inspection, and secret rotation commands,
  with separate sources, tests, and dependencies.

## Usage

Use OpenTofu 1.12 or newer within the 1.x series and an AWS profile with
publication administration permissions, such as `aggregator-admin`.
Set `AWS_PROFILE` for your shell, then run from this directory:

```sh
tofu init
tofu validate
tofu plan
```

The configured account is `905418096305`, region `eu-central-1`.
State is stored under `publication/tofu.tfstate`. The backend bucket,
`AggregatorPublicationRoleBoundary` policy, and bootstrap code object configured
in `main.tf` must already exist in AWS.

Local tools need Python 3.10 or newer. Inspection and release commands need the
AWS CLI on `PATH`. Only the secret writer needs the additional Python dependency:

```sh
python -m pip install -r tools/requirements.txt
python -B -m unittest discover -s ../lambda_publisher/tests/lambda_publisher -p 'test_*.py'
python -B -m unittest discover -s tools/tests -p 'test_*.py'
python tools/src/build_lambda_zip.py --source ../lambda_publisher/src/lambda_publisher
```

The builder writes `build/publication-lambda.zip`, a checksum, and a member
manifest. It maps the supplied source directory to the configured runtime package
`github_publication_runner`. Identical source bytes produce identical ZIPs.
The Lambda runtime supplies `boto3`; local tools are excluded from the ZIP.

The runtime and tools do not import each other. Packaging and release commands
receive the runtime source path through `--source` and can be used after either
component is moved.

See [Lambda runtime](../lambda_publisher/README.md) for the runtime and
[tools/README.md](tools/README.md) for operator commands.

## Checks

Use TFLint 0.65.0 with the repository-root `.tflint.hcl`. These static checks
require no AWS credentials:

```sh
tofu fmt -check -recursive
tflint --init
tflint --recursive --config="$(git rev-parse --show-toplevel)/.tflint.hcl" --minimum-failure-severity=notice
```

## Operations

Infrastructure and Lambda code releases are separate. OpenTofu ignores code
source changes so infrastructure plans preserve code releases. The code deployer
previews changes by default; `--apply` requires confirmation and checks the
Lambda revision and resulting hash.

Dynamic publication schedules and queue revisions are managed by the publication
operator outside this state. The watchdog runs every 15 minutes. Activation
and notifications are controlled by the Lambda environment in `main.tf`.

GitHub repository and project token values are written directly to Secrets
Manager, outside OpenTofu. The runner reads their configured ARNs and stops if a
secret cannot be read. The SNS email endpoint is also in Secrets Manager, but
the provider persists that endpoint in state and saved plans.

Keep state, saved plans, variable values, credentials, and downloaded live ZIPs
out of Git. Commit `.terraform.lock.hcl` to preserve provider selections.
