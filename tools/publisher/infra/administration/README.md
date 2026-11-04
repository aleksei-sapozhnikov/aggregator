# Publisher IAM administration

This is an **independent privileged OpenTofu root**, run as `administrator`.
It owns exactly three IAM policies and two attachments to the existing
`AggregatorPublicationAdmins` group. It does not create that group or
change Publisher Legacy permissions:

- `AggregatorPublisherManagement`: limited resource management for `aggregator-admin`
- `AggregatorPublisherStateAccess`: the single state key and its S3 lock file
- `AggregatorPublisherRoleBoundary`: scoped permissions for Lambda and Scheduler

The boundary allows temporary, read-only access to Legacy DynamoDB and S3 to
verify completion before the handoff. The boundary is separate from
`AggregatorPublicationRoleBoundary`, which remains managed elsewhere.

The AWS provider and backend use the standard AWS credential chain. If
`AWS_PROFILE` already points to `administrator`, do not set it again.
Confirm the identity before applying IAM changes.

This root pins AWS Provider 6.41.0, matching the shared administration root.
After pulling an update from the previous 5.x configuration, run `tofu init -upgrade`
to replace the older provider. The existing `aws login` session can then be
used through `AWS_PROFILE` without hardcoding an AWS profile in Terraform.

## Initial provisioning (PowerShell)

```powershell
aws sts get-caller-identity
tofu init -upgrade
tofu validate
tofu plan
# Verify the plan creates only the five Publisher IAM resources.
tofu apply
```

State: `s3://aws-administration-state-905418096305-eu-central-1/projects/aggregator/publisher/tofu.tfstate`.

If this privileged profile cannot read/write the new state key and its
`.tflock`, have the central AWS administrator authorize this exact path.
Do not use the project administrator or disable locking as a workaround.

Run this root only when Publisher IAM permissions change; not for new PRs.
