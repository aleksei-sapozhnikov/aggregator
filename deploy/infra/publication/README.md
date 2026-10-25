# Aggregator publication infrastructure

This is an independent OpenTofu root for the **long-lived AWS publication
infrastructure**. It uses the S3 backend key `publication/tofu.tfstate`.
Run it using the existing AWS CLI profile `aggregator-admin`.

## Migration status

**Prepared, NOT migrated.** The root contains backend/provider setup but
deliberately does not claim ownership of live resources yet.

The existing `aggregator-publication` CloudFormation stack owns 12 resources,
including a Lambda runner, DynamoDB state table, publication S3 bucket, IAM
roles, Scheduler group/watchdog, SNS topic, SQS DLQ, log group, and alarms.

The audit on 2026-10-25 also found 73 enabled schedules in that Scheduler
group. Those are created by the publication operator at runtime and should
not be managed as individual static OpenTofu resources.

Do **not** import the 12 CloudFormation-owned resources into OpenTofu while
CloudFormation also owns them. A controlled ownership handoff must precede
any OpenTofu apply, retaining existing physical resources and state.

## Design constraints

- Existing publication and queue processing must continue uninterrupted.
- Preserve the DynamoDB table, S3 snapshots, Lambda identity, Scheduler group,
  scheduled queue entries, roles, and watchdog.
- Maintain `Repository` attribution on supported/taggable infrastructure.
- Use `import` blocks and complete matching resource definitions; verify
  an import-only or no-op plan before applying.
- Retain and detach resources from CloudFormation through an explicitly
  reviewed migration process (e.g. `DeletionPolicy: Retain`).
- Do not store the GitHub access token, Lambda secrets or raw state in Git.
- Local publication operator sources under `C:\work\automate_pr` are
  required to reconstruct the live implementation and artifact packaging.
- After migration, do not maintain publication infrastructure via separate
  PowerShell procedures.

The admin IAM root owns the `AggregatorPublicationStateAccess` policy and
attaches it to the existing `AggregatorPublicationAdmins` group. Apply the
admin root's policy change before initializing this backend using
`aggregator-admin`.

## Expected workflow

1. Reconcile live CloudFormation and publication-operator source configuration.
2. Author the native OpenTofu resources and exact `import` declarations.
3. Validate a no-destruction takeover plan and document the CFN handoff.
4. Apply only after reviewing the migration and safeguarding live publication.
5. Confirm watchdog, schedules, queue and GitHub publishing still operate.

This root intentionally must **not** be treated as a migrated or validated
stack until the live resources have been transferred into its state.
