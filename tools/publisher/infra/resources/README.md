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
The secret contains a **plain email address**, not JSON. Keep the confirmed
SNS subscription intact; never replace it just to reconcile an email value.

### Notification configuration

The secret value and the confirmed SNS subscription endpoint must match.
Treat changing the notification email as a coordinated operation: updating the
secret value alone does **not** update the SNS subscription or confirm a new
address. Manage the subscription through OpenTofu and check its confirmation
status. A plan that replaces the subscription unexpectedly must not be applied.

**State caveat:** Terraform reads the email from Secrets Manager, but the
email also enters the encrypted OpenTofu state as a sensitive value. State
access must remain restricted.
