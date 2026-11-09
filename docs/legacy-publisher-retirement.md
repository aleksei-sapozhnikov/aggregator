# Publisher retirement

The legacy queue is complete. Its runner, tests, and deployment utilities have
been removed. The new Publisher no longer checks the legacy DynamoDB table or
S3 bucket. Its queue, schedule, state, publication behavior, and November 10,
2026 activation date are unchanged.

The temporary OpenTofu root at `tools/publisher-legacy/infra` retains only the
existing backend, provider, version constraint, and legacy bucket declaration
needed to destroy resources from the current state. Remove that root after the
state is empty. The shared `AggregatorPublicationAdmins` IAM group and the
new Publisher's state bucket are shared dependencies and must remain.

## Optional local backup

A backup is optional. If useful, save the final queue item and active snapshot
under `.local`, which is ignored by Git. No archive bucket or long-term
retention is needed.

From the repository root in PowerShell:

```powershell
$backupDir = Join-Path (Get-Location) ".local\legacy-publisher-backup"
New-Item -ItemType Directory -Force -Path $backupDir | Out-Null

aws dynamodb get-item `
  --table-name aggregator-publication-state `
  --key '{"pk":{"S":"QUEUE"}}' `
  --consistent-read `
  --output json | Set-Content -Path (Join-Path $backupDir "queue.json") -Encoding utf8

$queueItem = Get-Content (Join-Path $backupDir "queue.json") -Raw | ConvertFrom-Json
$revision = $queueItem.Item.data_revision.S
if (-not $revision) { throw "The legacy queue item has no active snapshot revision." }

aws s3 cp `
  "s3://aggregator-publication-data-905418096305-eu-central-1/snapshots/$revision.json" `
  (Join-Path $backupDir "active-snapshot.json")
```

Delete the local copy when it is no longer useful. Do not commit it.

## Stage 1: Remove the legacy AWS resources

### Update the new Publisher

Deploy the new Lambda code and its reduced inline policy **before** removing
legacy permissions from the IAM permission boundary. Otherwise the still-running
Lambda code may lose access to the old state before the new code is deployed.
Keep the new Publisher paused while making these changes. Confirm the active
queue revision and `paused: true` before and after deployment; neither the
queue state nor the schedule should be modified during retirement.

Build the new Lambda package and review its resource plan:

```powershell
Push-Location tools/publisher
python publisher.py build
Pop-Location

$env:AWS_PROFILE = "aggregator-admin"
Push-Location tools/publisher/infra/resources
tofu fmt -check -recursive
tofu init -input=false -lockfile=readonly
tofu validate
$runnerPlan = Join-Path $env:TEMP "publisher-runner-retirement.tfplan"
tofu plan "-out=$runnerPlan"
tofu show $runnerPlan
```

The notification email data source reads the secret by its stable name rather
than depending on `aws_secretsmanager_secret.notification_email.id`. With the
provider's `default_tags`, the managed secret metadata has an in-place tag
update. Referencing its resource ID defers the secret-version read until apply;
then the SNS endpoint is unknown during planning, and OpenTofu proposes to
replace the existing confirmed subscription because `endpoint` is replacement-
forcing. Reading by name makes the data source independent, so the endpoint is
resolved during planning and the imported subscription remains unchanged.

The only intended functional updates are `aws_lambda_function.runner`
(new code and removal of legacy environment variables) and
`aws_iam_role_policy.runner` (removal of legacy table/bucket access).
Do not apply a plan that replaces the confirmed SNS subscription or changes
the queue state, schedule, or publication data. The temporary tagging
workaround and fresh plan commands are below.

### Temporary workaround for Secrets Manager tagging

The existing `aggregator-admin` identity cannot call
`secretsmanager:TagResource` on the three Publisher secrets. A partial
resource apply has already succeeded for some unrelated `Repository`
default-tag updates, but failed on those secrets. Do **not** replay the old
saved plan.

The three `aws_secretsmanager_secret` resources temporarily use
`lifecycle { ignore_changes = [tags_all] }` to suppress only their
provider-inherited tag drift during retirement. This does not remove or
replace the secrets, their values, or the confirmed SNS subscription.
The original provider `default_tags` remains unchanged.

With this workaround the next normal plan is expected to contain **only**
the remaining in-place Lambda and runner IAM policy changes
(`0 to add, 2 to change, 0 to destroy`), assuming all earlier tag-only
updates really completed. This count is a prediction, not verified against
your live AWS state. If it still shows any secret tag update,
SNS subscription replacement, or other resource action, **stop** and inspect
the plan before applying. In particular, do not approve another
`secretsmanager:TagResource` attempt.

Regenerate a fresh full plan after pulling this commit:

```powershell
$env:AWS_PROFILE = "aggregator-admin"
Push-Location tools/publisher/infra/resources
tofu fmt -check -recursive
tofu init -input=false -lockfile=readonly
tofu validate
$runnerPlan = Join-Path $env:TEMP "publisher-runner-retirement.tfplan"
tofu plan "-out=$runnerPlan"
tofu show $runnerPlan
```

Apply only the freshly reviewed plan with `tofu apply $runnerPlan` after
confirming it contains exclusively the intended changes. Then remove the
saved plan and run `Pop-Location`.

After completing legacy retirement, remove these three temporary
`ignore_changes` blocks once appropriate `TagResource` permissions have
been granted, then review and apply a separate normal tag-reconciliation
plan. Do not widen administrator permissions just to complete the retirement.

After the Lambda code and runner policy updates have been applied, review the
Publisher administration plan to remove legacy table and bucket access from
the role boundary:

```powershell
$env:AWS_PROFILE = "administrator"
Push-Location tools/publisher/infra/administration
tofu fmt -check -recursive
tofu init -input=false -lockfile=readonly
tofu validate
$policyPlan = Join-Path $env:TEMP "publisher-boundary-retirement.tfplan"
tofu plan "-out=$policyPlan"
tofu show $policyPlan
```

It should contain only an in-place update to
`aws_iam_policy.publisher_role_boundary`, removing access to the old DynamoDB
table and S3 bucket. Expected plan: **0 to add, 1 to change, 0 to destroy**.
The temporary `TagPublisherSecrets` change to
`AggregatorPublisherManagement` was reverted because secret tag updates are
currently excluded by `ignore_changes = [tags_all]`, and broadening
`aggregator-admin` permissions is not needed for retirement.

Confirm the new Lambda is deployed and no longer uses legacy state before
applying the boundary update. If the plan also updates
`aws_iam_policy.publisher_management` or any other resource, **do not apply**.
Refresh the local branch and regenerate a new saved plan instead. Never reuse
an earlier saved plan after a source update or partial apply.

After reviewing the single-resource plan, apply it manually:

```powershell
tofu apply $policyPlan
Remove-Item $policyPlan
Pop-Location
```

The Lambda and runner IAM policy updates must already be applied before this
stage. Do not remove temporary secret tag suppression in this retirement
change; revisit it later as separate maintenance.

Verify that the new Lambda configuration no longer contains `LEGACY_*`
variables or legacy table/bucket policies before beginning the legacy destroy.
Do not change the 2026 publication calendar or the active DynamoDB queue as
part of this retirement.

### Destroy the legacy resources

The legacy S3 bucket is versioned. Its temporary root first records
`force_destroy = true` while deleting the other legacy resources. After that
apply succeeds, a second destroy removes the bucket and its object versions.
The AWS provider requires a successful apply to record this setting before
emptying a versioned bucket ([provider documentation](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/s3_bucket)).

From the repository root in PowerShell:

```powershell
$env:AWS_PROFILE = "aggregator-admin"
Push-Location tools/publisher-legacy/infra
tofu fmt -check -recursive
tofu init -input=false -lockfile=readonly
tofu validate
$legacyPlan = Join-Path $env:TEMP "legacy-publisher-retirement.tfplan"
tofu plan "-out=$legacyPlan"
tofu show $legacyPlan
```

The current plan is `0 to add, 1 to change, 23 to destroy`. The change sets
`force_destroy = true` on the old bucket. The 23 deletions are all legacy
resources: Lambda, Scheduler and schedule group, DynamoDB, S3 settings, IAM
roles and policies, secrets, SNS notifications, SQS dead-letter queue, and
CloudWatch logs and alarms. The plan must contain no `aggregator-publisher-*`
resource, creation, or replacement. If it differs, stop and review it.

### Recovery if legacy secret deletion is denied

A first legacy-root apply can partially succeed: Lambda, Scheduler, roles,
notifications, and other resources were deleted, while the three old
Secrets Manager secrets failed with `AccessDeniedException` for
`secretsmanager:DeleteSecret`. This is a permission problem with the
`aggregator-admin` identity, **not** a reason to alter the new Publisher
resources or remove failed objects from OpenTofu state.

Grant one narrowly scoped, **temporary inline user policy**, using the
`administrator` profile. Its only action is `secretsmanager:DeleteSecret`
and its only resources are the following three **old**
`aggregator-publication-*` secrets. Do not grant permissions on
`aggregator-publisher-*` secrets.

From the repository root, create a private policy file and install it:

```powershell
$policyFile = Join-Path (Get-Location) ".local/legacy-publisher-delete-secrets.json"
New-Item -ItemType Directory -Force ".local" | Out-Null
@'
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "DeleteOnlyThreeRetiredPublicationSecrets",
      "Effect": "Allow",
      "Action": "secretsmanager:DeleteSecret",
      "Resource": [
        "arn:aws:secretsmanager:eu-central-1:905418096305:secret:aggregator-publication-github-token-6zeJFl",
        "arn:aws:secretsmanager:eu-central-1:905418096305:secret:aggregator-publication-project-token-evS6Wk",
        "arn:aws:secretsmanager:eu-central-1:905418096305:secret:aggregator-publication-notification-email-kXJ5RE"
      ]
    }
  ]
}
'@ | Set-Content -Path $policyFile -Encoding utf8

$env:AWS_PROFILE = "administrator"
aws sts get-caller-identity
aws iam put-user-policy `
  --user-name aggregator-admin `
  --policy-name TemporaryDeleteRetiredPublicationSecrets `
  --policy-document "file://$($policyFile.Replace('\', '/'))"
if ($LASTEXITCODE -ne 0) { throw "Temporary IAM policy could not be installed" }
```

If `administrator` cannot edit `aggregator-admin` inline policies, stop
and use an authorized IAM administrator. Do not work around access denial by
deleting state entries or broadening the new Publisher's management policy.

With the temporary permission installed, **discard the original saved plan**
because the first apply already changed AWS and the OpenTofu state. Generate
a fresh full plan for the legacy root:

```powershell
$env:AWS_PROFILE = "aggregator-admin"
Push-Location tools/publisher-legacy/infra
tofu state list
$legacyPlan = Join-Path $env:TEMP "legacy-publisher-retirement-retry.tfplan"
tofu plan "-out=$legacyPlan"
tofu show $legacyPlan
```

The retry must destroy only the remaining old secrets and other failed legacy
resources, with at most the expected in-place `force_destroy = true` change to
`aws_s3_bucket.publication`. **Do not approve changes to any new Publisher
resource**. If the provider fails to delete even with the temporary policy,
stop and inspect the actual IAM evaluation before attempting more changes.

After the reviewed retry succeeds, remove the temporary inline user policy
immediately (it is not managed in OpenTofu):

```powershell
$env:AWS_PROFILE = "administrator"
aws iam delete-user-policy `
  --user-name aggregator-admin `
  --policy-name TemporaryDeleteRetiredPublicationSecrets
if ($LASTEXITCODE -ne 0) { throw "Failed to revoke temporary delete permission" }
Remove-Item $policyFile
```

Return to the legacy root (if needed) and verify `tofu state list`.
Only the old `aws_s3_bucket.publication` should remain before the final
bucket destroy. The Secrets Manager secrets are normally scheduled for
deletion with their recovery windows, rather than disappearing immediately.
Do not use force-delete-without-recovery to accelerate this cleanup.

After review, apply the saved plan manually, then plan the final bucket
deletion:

```powershell
tofu apply $legacyPlan
$bucketPlan = Join-Path $env:TEMP "legacy-publisher-bucket-destroy.tfplan"
tofu plan -destroy "-out=$bucketPlan"
tofu show $bucketPlan
```

The second plan should contain only the old S3 bucket deletion. Review it,
then apply it manually and verify that the legacy state is empty:

```powershell
tofu apply $bucketPlan
tofu state list
Pop-Location
```

### Remove shared legacy IAM policies

After the workload roles are destroyed, remove the old shared IAM policies
and their group attachments. Keep `AggregatorPublicationAdmins`, which the new
Publisher still uses.

```powershell
$env:AWS_PROFILE = "administrator"
Push-Location environments/shared/infra/administration
tofu init -input=false -lockfile=readonly
tofu validate
$sharedPlan = Join-Path $env:TEMP "shared-legacy-publisher-iam.tfplan"
tofu plan "-out=$sharedPlan"
tofu show $sharedPlan
```

The expected shared-administration plan is **0 to add, 0 to change,
5 to destroy**. These are exactly the five **legacy-only** objects:

| OpenTofu address | AWS object |
| --- | --- |
| `aws_iam_group_policy_attachment.publication_publication_management` | Attachment of `AggregatorPublicationManagement` |
| `aws_iam_group_policy_attachment.publication_publication_state_access` | Attachment of `AggregatorPublicationStateAccess` |
| `aws_iam_policy.publication_management` | `AggregatorPublicationManagement` |
| `aws_iam_policy.publication_role_boundary` | `AggregatorPublicationRoleBoundary` |
| `aws_iam_policy.publication_state_access` | `AggregatorPublicationStateAccess` |

**Do not confuse the `Publication` policies with the new `Publisher`
policies.** The existing `AggregatorPublicationAdmins` IAM group is shared and
must remain, along with the new `AggregatorPublisherManagement` and
`AggregatorPublisherStateAccess` attachments managed in the separate
Publisher administration root. No group destruction or `Publisher` policy
destruction should appear in this plan.

Before applying, confirm that the new Publisher administration root has
already deployed its management and state-access attachments, and that the
legacy workload roles have been destroyed. The legacy role boundary cannot be
deleted while any role still uses it. Inspect the five deletions explicitly;
an IAM attachment ID that contains an autogenerated suffix is normal, but its
`policy_arn` must still point to the expected **legacy** policy.

If the plan includes any other change, stop. Otherwise apply the reviewed
saved plan manually:

```powershell
tofu apply $sharedPlan
tofu state list
Pop-Location
```

Keep this shared administration root: only the five legacy records are removed,
not its backend or other project IAM resources.

## Stage 2: Remove the temporary OpenTofu root

After all legacy resources and shared IAM policies have been destroyed,
confirm `tofu state list` in `tools/publisher-legacy/infra` is empty, then
remove the temporary configuration from the branch:

```powershell
Push-Location tools/publisher-legacy/infra
tofu state list
Pop-Location
git rm -r tools/publisher-legacy/infra
```
