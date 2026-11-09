# Legacy Publisher retirement

The legacy `aggregator-publication-*` runner has completed its queue through
PR #349 and release `v0.7.13`. Its Lambda, 15-minute watchdog, scheduler group,
execution roles and policies, notification resources, secrets, and deployment
tooling are retired from source control. The newer `aggregator-publisher-*`
runner and its November 10, 2026 start date remain unchanged.

## Data dependency and deletion order

The new runner has a one-time handoff gate. Before recording
`legacy_handoff_complete`, it consistently reads the legacy DynamoDB `QUEUE`
item, loads the referenced schedule snapshot from the legacy S3 bucket, and
checks that `aggregator-071-merge` and all scheduled legacy events are
complete. The legacy table, snapshot bucket, and the new runner's read
permissions are therefore retained as handoff dependencies. Do not remove
them or their permissions before the new Publisher records
`legacy_handoff_complete: true` in its own state table.

After that flag is confirmed, preserve a final copy of the legacy table before
deleting the table or bucket. Use an approved encrypted S3 archive bucket in
`eu-central-1` with restricted access and lifecycle retention appropriate for
the project's audit needs. Do not put the export, local copies, or credentials
in Git.

1. Confirm the legacy watchdog is disabled and no legacy invocation is
   in-flight. Confirm the final event and queue completion against the legacy
   state and snapshot.
2. Confirm point-in-time recovery is enabled for
   `aggregator-publication-state`. Record a UTC export time after the final
   queue update.
3. Start a full point-in-time export to the approved archive bucket. Replace
   the placeholders with that bucket and a unique prefix; use the account's
   normal AWS profile and approved KMS key if the archive requires SSE-KMS:

   ```powershell
   aws dynamodb export-table-to-point-in-time `
     --table-arn arn:aws:dynamodb:eu-central-1:905418096305:table/aggregator-publication-state `
     --s3-bucket <approved-archive-bucket> `
     --s3-prefix aggregator/publication-state/<UTC-timestamp> `
     --export-time <UTC-timestamp> `
     --export-format DYNAMODB_JSON `
     --export-type FULL_EXPORT
   ```

4. Poll `aws dynamodb describe-export --export-arn <export-arn>` until the
   export status is `COMPLETED`. Confirm the reported item count and S3 export
   manifest, data files, encryption, and archive access. Keep the export ARN,
   export time, item count, and verification result in the operator's
   controlled change record. Do not paste item contents into that record.
5. Preserve the legacy S3 snapshots as well. Copy every current and
   noncurrent object version, along with delete markers and the bucket's
   version inventory, into the approved archive using a version-aware S3
   Batch Operations copy or an equivalent audited process. Verify destination
   object/version counts and checksums against the source inventory. A simple
   `aws s3 sync` is insufficient for a versioned bucket because it skips
   noncurrent versions.
6. Only after the handoff flag, DynamoDB export, and snapshot archive have all
   been verified, rerun the legacy OpenTofu plan from current state. Review
   every delete and apply it separately through the operator's approved
   change process. The shared administration policy plan must follow legacy
   role deletion because those roles still have the legacy permissions
   boundary attached. A plan generated before handoff is stale for that later
   deletion and must not be applied as-is.

The export is an independent preserved copy; it does not keep the live
handoff dependency available. This is why the table and snapshot bucket must
remain until the new runner records completion.

## Infrastructure plan roots

The legacy OpenTofu root under `tools/publisher-legacy/infra` is now a minimal
retirement root with its original backend and provider configuration. Its
empty configuration makes the legacy state deletions reviewable with
`tofu plan`; do not apply that plan until the data-deletion conditions above
are met. The shared administration root separately removes the old
publication management and state-access policies. It retains the
`AggregatorPublicationAdmins` group because the new Publisher uses that group.

The current legacy-root plan contains 24 deletes with no additions, updates,
or replacements. It includes the DynamoDB table, versioned S3 bucket, Lambda,
watchdog and schedule group, execution roles and inline policies, log group,
alarms, SNS topic and subscription, SQS dead-letter queue, and three Secrets
Manager secrets. The plan output is intentionally not kept in the repository;
regenerate it after the handoff and exports are complete.

The new Publisher administration and resource roots still contain a narrow
read permission and handoff configuration for the legacy table and snapshot
bucket. These are deliberately retained until `legacy_handoff_complete` is
recorded. Remove those references and permissions in a follow-up cleanup,
afterward, with a fresh plan that contains only those expected policy and
environment changes.
