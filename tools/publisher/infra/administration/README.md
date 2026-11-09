# Publisher IAM administration

This is an **independent privileged OpenTofu root**, run as `administrator`.
It owns exactly three IAM policies and two attachments to the existing
`AggregatorPublicationAdmins` group. It does not create that group:

- `AggregatorPublisherManagement`: limited resource management for `aggregator-admin`
- `AggregatorPublisherStateAccess`: the single state key and its S3 lock file
- `AggregatorPublisherRoleBoundary`: scoped permissions for Lambda and Scheduler

The boundary grants access only to the Publisher's own queue state, snapshots,
logs, notifications, Lambda, Scheduler, and token secrets.

The AWS provider and backend use the standard AWS credential chain. If
`AWS_PROFILE` already points to `administrator`, do not set it again.
Confirm the identity before applying IAM changes.

The root pins AWS Provider 6.41.0, matching the shared administration root.
Use `AWS_PROFILE` for authentication rather than hardcoding credentials.

## Manage IAM policies (PowerShell)

```powershell
aws sts get-caller-identity
tofu init -input=false -lockfile=readonly
tofu validate
tofu plan
# Review the intended IAM policy and attachment changes.
tofu apply
```

State: `s3://aws-administration-state-905418096305-eu-central-1/projects/aggregator/publisher/tofu.tfstate`.

If this privileged profile cannot read/write the new state key and its
`.tflock`, have the central AWS administrator authorize this exact path.
Do not use the project administrator or disable locking as a workaround.

Run this root only when Publisher IAM permissions change; not for new PRs.
