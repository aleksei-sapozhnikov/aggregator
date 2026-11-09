# Publisher runtime resources

This root is run as `aggregator-admin` after the Publisher administration
root has created the management/state policies and the role boundary.

This root also pins AWS Provider 6.41.0, matching Publisher administration.
Use `tofu init -upgrade` after changing from the previous 5.x configuration.

## Initial provisioning (PowerShell)

From `tools/publisher`, build the Lambda ZIP:

```powershell
python publisher.py build
```

Then run from `tools/publisher/infra/resources`:

```powershell
$env:AWS_PROFILE = "aggregator-admin"
aws sts get-caller-identity
tofu init -upgrade
tofu validate
tofu plan
# Review the plan before provisioning new AWS resources.
tofu apply
```

State: `s3://aggregator-project-tofu-state-905418096305-eu-central-1/aggregator-publisher/tofu.tfstate`.

The `aggregator-publisher-*` resources are managed by this independent root.
The watchdog has a 15-minute interval and starts on the configured date.

Secrets must receive their GitHub token values separately after provisioning.
Terraform is not required for each publication; use `publisher.py apply`
to update JSON plans and `publisher.py calendar --live` for status.

## Failure notification email

The email address is not stored in repository files. Terraform manages the
`aggregator-publisher-notification-email` secret metadata, and the email
subscription reads its value from the current Secrets Manager version.
The secret contains a **plain email address**, not JSON. The pre-existing
confirmed SNS subscription should be **imported**, not recreated.

### Bootstrap an already deployed Publisher

Run these steps after updating `dev`.

1. Apply the IAM policy change from `tools/publisher/infra/administration`
   with the `administrator` AWS profile:

```powershell
$env:AWS_PROFILE = "administrator"
tofu plan
tofu apply
```

2. From `tools/publisher/infra/resources`, switch to `aggregator-admin`
   and create only the empty email secret. A narrowly scoped `-target`
   is needed once because the subscription data source cannot read a
   secret value before it exists.

```powershell
$env:AWS_PROFILE = "aggregator-admin"
aws sts get-caller-identity
tofu apply -target=aws_secretsmanager_secret.notification_email
```

3. Store the email in the new secret. Enter the address already used by
   the confirmed SNS subscription. Avoid committing it to files.

```powershell
$email = Read-Host "Confirmed SNS notification email"
aws secretsmanager put-secret-value `
  --secret-id aggregator-publisher-notification-email `
  --secret-string $email
Remove-Variable email
```

4. Check if the existing SNS subscription is already in Terraform state:

```powershell
tofu state list
```

If `aws_sns_topic_subscription.failure_email` is **not** listed, import
the existing confirmed subscription using its exact ARN:

```powershell
tofu import aws_sns_topic_subscription.failure_email `
  arn:aws:sns:eu-central-1:905418096305:aggregator-publisher-failure:a88140ac-eecb-4ad7-a466-fbdf5ec4a460
```

If it is already listed, **do not import it again**.

5. Inspect the full plan and apply it only if the SNS subscription is
   **not** being created, replaced, or destroyed:

```powershell
tofu plan
tofu apply
```

The plan should only include any remaining in-place description changes.
The existing email subscription will stay confirmed and does not require
a new confirmation link.

If the plan proposes replacing the subscription, verify that the value in
Secrets Manager is exactly the existing SNS subscription endpoint before
proceeding. Do not approve a replacement to fix an email mismatch.

**State caveat:** Terraform reads the email from Secrets Manager, but a
copy of that email still enters the OpenTofu state (as a sensitive value).
The state is stored in the encrypted project S3 bucket with restricted IAM
access. The email is absent from the repository's current source files.
