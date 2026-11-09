# Publisher runtime resources

This root is run as `aggregator-admin` after the Publisher administration
root has created the management/state policies and the role boundary.

This root pins AWS Provider 6.41.0, matching Publisher administration.

## Manage runtime infrastructure (PowerShell)

From `tools/publisher`, build the Lambda ZIP:

```powershell
python publisher.py build
```

Then run from `tools/publisher/infra/resources`:

```powershell
$env:AWS_PROFILE = "aggregator-admin"
aws sts get-caller-identity
tofu init -input=false -lockfile=readonly
tofu validate
tofu plan
# Review intended changes before applying.
tofu apply
```

State: `s3://aggregator-project-tofu-state-905418096305-eu-central-1/aggregator-publisher/tofu.tfstate`.

The `aggregator-publisher-*` resources are managed by this independent root.
The watchdog runs every 15 minutes and enforces the configured start date.

Secrets must receive their GitHub token values separately after provisioning.
Terraform is not required for each publication; use `publisher.py apply`
to update JSON plans and `publisher.py calendar --live` for status.

## Failure notification email

The email address is not stored in repository files. Terraform manages the
`aggregator-publisher-notification-email` secret metadata, and the email
subscription reads its value from the current Secrets Manager version.
The secret contains a **plain email address**, not JSON. Keep the existing confirmed SNS subscription intact; never replace it
just to reconcile an email value.

### Notification configuration

The secret must contain the plain email address currently subscribed to the
SNS topic. Update it through Secrets Manager, not through source files:

```powershell
$env:AWS_PROFILE = "aggregator-admin"
$email = Read-Host "Confirmed SNS notification email"
aws secretsmanager put-secret-value `
  --secret-id aggregator-publisher-notification-email `
  --secret-string $email
Remove-Variable email
```

The email subscription is managed by OpenTofu; retain the confirmed
subscription instead of recreating it. If the subscription is not yet present
in OpenTofu state, import the existing subscription ARN before applying a plan.
A plan that would replace the email subscription must be investigated rather
than applied.

**State caveat:** Terraform reads the email from Secrets Manager, but the
email also enters the encrypted OpenTofu state as a sensitive value. State
access must remain restricted.
