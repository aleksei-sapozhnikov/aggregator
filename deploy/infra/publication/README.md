# Aggregator publication infrastructure

This is an independent OpenTofu root for the **long-lived AWS publication
infrastructure**. It uses the S3 backend key `publication/tofu.tfstate`.
Run it using the existing AWS CLI profile `aggregator-admin`.

## Migration status

**Complete.** CloudFormation was deleted after both retention policies were
set on all 12 stack resources. OpenTofu now manages those resources, their six
separately addressable IAM/S3 settings, the notification endpoint secret, the
SNS topic policy, and the existing confirmed email subscription. The final
plan reported zero pending imports, updates, creates, replacements, or
deletions.

The final invariant comparison matched the DynamoDB queue item and revision,
S3 snapshot metadata, all 73 schedules, watchdog state, Lambda code hash, and
activation flags. GitHub and project token values remain in Secrets Manager;
the email endpoint is also in Secrets Manager and, because the SNS provider
requires it as a resource argument, in encrypted publication state and saved
plans. Dynamic schedules remain outside OpenTofu state.

The Lambda remains `ACTIVATION_ENABLED=false` and
`NOTIFICATIONS_ENABLED=false`. Runtime checks confirmed the watchdog exits
with `status=disabled`, the email subscription is confirmed, alarms are `OK`,
and the DLQ is empty. No active GitHub publication or test email was sent.

The audit on 2026-10-25 also found 73 enabled schedules in that Scheduler
group. Those are created by the publication operator at runtime and should
not be managed as individual static OpenTofu resources.

Do not add the 72 dynamic publication schedules to OpenTofu state. The
publication operator continues to create, update, and delete those schedules.

## Design constraints

- Existing publication and queue processing must continue uninterrupted.
- Preserve the DynamoDB table, S3 snapshots, Lambda identity, Scheduler group,
  scheduled queue entries, roles, and watchdog.
- Maintain `Repository` attribution on supported/taggable infrastructure.
- Keep the native resource declarations in `publication_resources.tf` aligned
  with the imported state. The completed import plan contained only the
  reviewed `Repository` tag and `publish=false` changes; the last plan before
  adding SNS notification resources was empty.
- The CloudFormation handoff is complete; do not recreate stack ownership.
- Do not store the GitHub access token, Lambda secrets or raw state in Git.
- Keep GitHub and project tokens outside OpenTofu configuration and state. The
  SNS email endpoint is stored in Secrets Manager and read by OpenTofu for the
  SNS subscription; AWS provider state and saved plans therefore hold the
  endpoint value. Keep the remote state private and encrypted, and never print
  or share saved plan contents.
- Local publication operator sources under `C:\work\automate_pr` are
  required to reconstruct the live implementation and artifact packaging.
- The current operator source reads the checksum-managed
  `runner/deployment-outputs.json` file. Its exporter reads OpenTofu outputs;
  run it from `C:\work\automate_pr` with
  `--tofu-root C:\work\aggregator\deploy\infra\publication` and
  `--profile aggregator-admin` before building the next publication ZIP. The
  existing generated ZIP is stale and still calls CloudFormation; do not use it
  after stack detachment. The operator workspace is not a Git repository, so
  its deployment-flow source still needs a version-controlled home.
- After migration, do not maintain publication infrastructure via separate
  PowerShell procedures.

`deploy/infra/admin/state_storage.tf` declares the `AggregatorPublicationStateAccess`
policy, scoped to the publication state key and lock file, and attaches it to
the existing `AggregatorPublicationAdmins` group. The policy and attachment
are already represented in admin state; no additional admin state-access
change was needed for the publication handoff.

## Lambda runtime package

`src/lambda_publisher/handler.py` is the Lambda entrypoint. The helper modules
are grouped under `src/lambda_publisher/github` and
`src/lambda_publisher/publication`. The ZIP builder maps this source package to
the existing runtime package name `github_publication_runner`, preserving the
configured Lambda handler `github_publication_runner.handler.lambda_handler`.
This keeps the source tree short without requiring a handler-configuration
change in AWS.

Python utilities live under `src/tools`. Handler tests mirror the source
package at `tests/lambda_publisher/test_handler.py` and check credential
selection and fail-closed behavior.

Run these focused tests from the repository root with:

```sh
python -B -m unittest discover -s deploy/infra/publication/tests/lambda_publisher -p 'test_*.py'
```

The local operator tools need Python 3.10 or newer and the AWS CLI on `PATH`.
Install the extra dependency used only by the interactive secret writer with:

```sh
python -m pip install -r deploy/infra/publication/requirements-tools.txt
```

Build a reproducible package from the repository root with:

```sh
python deploy/infra/publication/src/tools/build_lambda_zip.py
```

The command writes `.temp/publication-lambda.zip`, a SHA-256 file, and a member
manifest. It uses sorted paths, fixed timestamps, fixed file permissions, and
stored ZIP entries so identical source files produce identical artifact bytes.
The manifest's base64 digest is the AWS Lambda `source_code_hash` value. The
builder uses only local source files and does not call AWS or package runtime
secrets. It builds the permanent Lambda artifact, not the operator's
`publication-update.zip` used to synchronize publication schedules. Any source
or package-layout change alters the candidate hash; compare the candidate with
the private live ZIP before release.

The publication operator scripts have separate purposes and run only when
their corresponding operation is needed:

- `src/tools/build_lambda_zip.py` packages runtime code locally after source
  changes. It makes no AWS calls.
- `src/tools/compare_lambda_zip.py` checks a downloaded live ZIP against the
  candidate before a release. It prints member names and hashes, never file
  contents.
- `src/tools/deploy_lambda_code.py` performs a dry run by default. Use it for a
  code-only release after reviewing and comparing the candidate. `--apply`
  requires typing the function name, uses the observed Lambda revision, and
  updates code only; it does not change environment variables or invoke the
  function.
- `src/tools/inspect_publication_notifications.py` is read-only. Use it after
  an infrastructure change or when diagnosing email alerts; it summarizes the
  SNS subscription, alarms, DLQ, and IAM policies without printing the email
  endpoint or reading messages.
- `src/tools/inspect_watchdog_runtime.py` is read-only. Use it after a natural
  watchdog run or infrastructure change to summarize sanitized log events. If
  CloudFormation no longer owns the stack, provide `--start-time-utc`.
- `src/tools/set_publication_secrets.py` is interactive and writes token values
  only during initial setup or rotation, after confirmation.
- `src/tools/aws_cli.py` is the shared, redacting AWS CLI adapter imported by
  the operator commands; it is not run directly.

For a code-only release, first inspect the candidate without applying it:

```sh
python deploy/infra/publication/src/tools/deploy_lambda_code.py --profile aggregator-admin --region eu-central-1
```

After reviewing the candidate and its comparison, submit the guarded code-only
update with `--apply`. The script checks the account, asks for the function
name, waits for completion, and verifies the hash.

## Publication tokens

`secrets.tf` declares two protected secret containers with stable names:

- `aggregator-publication-github-token`
- `aggregator-publication-project-token`

The secret resources contain metadata only. No credential value is provided to
OpenTofu, so the token values stay out of the configuration and state. The
operator reports that both containers and the function's scoped read policy
were created on 2026-10-26, and that both values have since been stored as
`AWSCURRENT`. The change set removed direct token environment values and set
both ARN references. A natural watchdog invocation completed with
`status=disabled`; `ACTIVATION_ENABLED=false` prevented queue processing. To
write or rotate values in the future, use the interactive
helper from a terminal with the existing `aggregator-admin` profile:

```sh
python deploy/infra/publication/src/tools/set_publication_secrets.py
```

The helper hides typed input, checks both secret containers before writing,
requires an explicit `WRITE` confirmation, and reports only secret names and
version IDs. It does not retrieve or print secret values. The admin group
policy now has narrow Secrets Manager write permissions from
`deploy/infra/admin/policies/AggregatorPublicationManagement.json`; it omits
`GetSecretValue` for the GitHub and project token secrets and omits
`DeleteSecret`. A separate statement allows `GetSecretValue` only for the SNS
notification endpoint secret so OpenTofu can read the subscription endpoint.

The publication role boundary permits `GetSecretValue` only on ARN patterns for
those two names with six single-character wildcards for AWS's generated suffix.
The `PublicationSecretRead` inline policy grants the function role access to
the exact secret ARN outputs from this root; it has a distinct name from
CloudFormation's existing `Runner` policy. The deployed runtime reads
`GITHUB_SECRET_ARN` and `PROJECT_SECRET_ARN` first and fails closed if a
configured secret cannot be read. The observed watchdog invocation exited
with `status=disabled`; since activation remains off, that check did not
exercise an active publication. The reviewed change set that removed plaintext
environment values and retained the 12 resources has already been executed.

## SNS failure notifications

The notification topic remains `aggregator-publication-failure`. The root now
declares its observed default owner-account policy and the existing confirmed
email subscription. It reads the endpoint from the
`aggregator-publication-notification-email` Secrets Manager secret. The email
is not a Lambda credential: the Lambda has no permission to read this secret;
OpenTofu reads it to describe the subscription endpoint.

The AWS provider requires `endpoint` on `aws_sns_topic_subscription`. The
provider stores that value in the publication state and in any saved plan even
though it is marked sensitive in the expression. The S3 backend is encrypted
and versioned, and local plans belong in the ignored `.temp/` directory. Do not
print, commit, or share plan files or JSON plan output.

The topic policy, notification endpoint secret, and existing confirmed
subscription are imported and have no plan drift. The secret and subscription
use `prevent_destroy = true`. Changing the notification address requires a
separately reviewed subscription change; changing only the secret value would
make the configured endpoint differ and must not be applied blindly.

The supplied account inventory also found the separate
`aws-sam-cli-managed-default` stack and its source bucket. The deployed
publication template references that bucket for Lambda code. Keep this SAM
deployment infrastructure outside the publication stack handoff unless a
separate reviewed change explicitly replaces it.

To compare the downloaded live ZIP with the deterministic candidate without
printing any file contents, run:

```sh
python deploy/infra/publication/src/tools/compare_lambda_zip.py "PATH_TO_PRIVATE_LIVE_LAMBDA_ZIP" .temp/publication-lambda.zip
```

The comparison reports only member names and SHA-256 digests. Keep the live ZIP
inside the private collector directory and do not add it to Git.

The read-only notification inspector reports subscription status, alarm
actions, queue attributes, and IAM scope without printing endpoints or reading
queue messages:

```sh
python deploy/infra/publication/src/tools/inspect_publication_notifications.py --profile aggregator-admin --region eu-central-1
```

The sanitized watchdog log inspector is available for runtime checks and does
not invoke the Lambda:

```sh
python deploy/infra/publication/src/tools/inspect_watchdog_runtime.py --profile aggregator-admin --region eu-central-1
```

The publication state now owns the long-lived resources. Dynamic Scheduler
jobs remain operator-managed.
