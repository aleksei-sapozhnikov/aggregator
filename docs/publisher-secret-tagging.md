# Publisher Secrets Manager tags

The Publisher resource root uses the AWS provider's `Repository` default
tag. Three existing Secrets Manager secrets also have a `Name` tag, but
were provisioned without `Repository`. Earlier resource applies failed on
`secretsmanager:TagResource` because the `AggregatorPublisherManagement`
policy required `aws:RequestTag/Name` even when the request only added
`Repository`.

The permanent policy permits `aggregator-admin` to add **only**
`Repository=https://github.com/aleksei-sapozhnikov/aggregator` to an
existing Publisher secret with one of the three approved `Name` tags.
It does not grant access to other secrets or permission to remove tags.
The temporary `ignore_changes = [tags_all]` workarounds have been removed.

## Apply in order (PowerShell)

Run commands from the repository root on the
`scheduler-retirement` branch with a clean checkout. Do not reuse any
saved plan from before these changes. This is a separate follow-up
operation after legacy Publisher destruction.

### 1. Publisher administration — grant narrowly scoped tagging

```powershell
$env:AWS_PROFILE = "administrator"
Push-Location tools/publisher/infra/administration
tofu init -input=false -lockfile=readonly
tofu validate

$tagPolicyPlan = Join-Path $env:TEMP "publisher-secret-tag-policy.tfplan"
tofu plan "-out=$tagPolicyPlan"
tofu show $tagPolicyPlan
```

Expected: `0 to add, 1 to change, 0 to destroy`, involving **only**
`aws_iam_policy.publisher_management`. In that policy, the
`TagPublisherSecrets` statement must add the
`aws:ResourceTag/Name` check, accept only
`aws:RequestTag/Repository` with the exact repository URL, and
limit `aws:TagKeys` to `Repository`. The role boundary and other
policies must remain unchanged. If the plan differs, stop.

```powershell
tofu apply $tagPolicyPlan
if ($LASTEXITCODE -ne 0) { throw "Publisher management policy apply failed" }
Remove-Item $tagPolicyPlan
Pop-Location
```

Allow normal IAM policy propagation before the second phase. If AWS
temporarily reports AccessDenied after a successful first apply, inspect
the identity and newly effective policy rather than broadening access.

### 2. Publisher resources — reconcile the three secrets' tags

```powershell
$env:AWS_PROFILE = "aggregator-admin"
Push-Location tools/publisher/infra/resources
tofu init -input=false -lockfile=readonly
tofu validate

$secretTagsPlan = Join-Path $env:TEMP "publisher-secret-tags.tfplan"
tofu plan "-out=$secretTagsPlan"
tofu show $secretTagsPlan
```

Expected: `0 to add, 3 to change, 0 to destroy`. Only these resources
should receive the inherited `Repository` tag, in place:

- `aws_secretsmanager_secret.repository`
- `aws_secretsmanager_secret.project`
- `aws_secretsmanager_secret.notification_email`

**Do not apply** if the plan includes a new/replaced
`aws_sns_topic_subscription.failure_email`, Lambda, scheduler,
DynamoDB, or any other Publisher resource. The notification secret data
source reads the existing secret by its stable name to avoid deferring
the SNS endpoint until apply.

```powershell
tofu apply $secretTagsPlan
if ($LASTEXITCODE -ne 0) { throw "Publisher secret tag apply failed" }
Remove-Item $secretTagsPlan

tofu plan -detailed-exitcode
$planExit = $LASTEXITCODE
if ($planExit -ne 0) {
    throw "Publisher resource root is not clean (exit code $planExit)"
}
Pop-Location
```

The final normal plan should report no changes. No Publisher queue, schedule,
secret values, subscription endpoint, or runtime behavior should be changed.
