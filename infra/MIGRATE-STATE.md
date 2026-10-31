# Aggregator state and account ownership migration

This runbook moves project IAM administration into an isolated,
Foundation-protected backend and project workloads into their own bucket.
**A Git commit alone changes no AWS resource or S3 object.**
OpenTofu applies and state migrations are deliberate, operator-run steps.

## Target ownership

| Root | AWS operator | Backend |
| --- | --- | --- |
| `aws_foundation/bootstrap` | AWS root | Root-protected bootstrap bucket |
| `aws_foundation/aws_account` | `infra-admin` | Foundation-state bucket, `foundation/aws_account/tofu.tfstate` |
| `aggregator/infra/administration` | `infra-admin` | Administration-state bucket, `aggregator/tofu.tfstate` |
| `aggregator/infra/state` | `aggregator-admin` | Project bucket, `state/tofu.tfstate` |
| `aggregator/infra/demo` | Delegated user / approved OIDC jobs | Project bucket, `demo/tofu.tfstate` |
| `aggregator/deploy/infra/publication` | `aggregator-admin` | Project bucket, `publication/tofu.tfstate` |

The central operator is presently named `infra-admin` in AWS.
`administrator` denotes its role, not a silently renamed IAM identity.
There is no project-specific resource definition in Foundation.

## Preparation — do not skip

1. Work from the `dev` code in both repositories with OpenTofu 1.12+
   and account `905418096305`, region `eu-central-1`.
2. Freeze concurrent manual plans/applies, scheduled publication writes,
   **demo branch promotions**, and active GitHub Environment approvals
   before switching operational backends. Avoid promoting changed CI scripts
   to `demo` until every relevant AWS resource and state is ready.
3. For each existing root, confirm `tofu state list` is nonempty and
   securely back up the raw state. Preserve S3 source versions and
   their `.tflock` files; do not commit state/plans or log their values.
4. Reject any `plan` that destroys, replaces or recreates the current
   serving Docker Compose EC2 instance, project IAM user, old state bucket,
   GitHub OIDC provider, or administrative S3 contents.
5. No `tofu apply` should be performed just to 'fix' an empty state.
   An empty state at a previously managed backend is a **hard stop**.

## 1 — Create generic Foundation and Administration buckets

In `aws_foundation/aws_account`, use the already initialized
`foundation/aws_account/tofu.tfstate` state in the **legacy** shared
`aggregator-tofu-state-905418096305-eu-central-1` bucket.

The new checked-in backend points at a bucket which does not yet exist.
Explicitly retain the old backend for the creation step:

```powershell
$env:AWS_PROFILE = "infra-admin"
tofu init -migrate-state -backend-config="bucket=aggregator-tofu-state-905418096305-eu-central-1"
tofu state list
tofu plan
```

Review the full plan. New buckets:
- `aws-foundation-state-905418096305-eu-central-1`
- `aws-administration-state-905418096305-eu-central-1`

Existing legacy bucket resources must appear as **forget**, **never destroy**,
through explicit `removed { lifecycle { destroy = false } }` blocks.
The old S3 bucket, its version history, and its deny policy must remain intact.
Also inspect the account-wide GitHub OIDC tagging change.

Only when the plan matches these conditions may the operator run
`tofu apply`. Inspect both new buckets and their policies. Do not
apply `aws_foundation/bootstrap` merely for this migration.

## 2 — Move Foundation state to its own bucket

From the *same initialized* `aws_account` directory, after a confidential
state backup and successful creation:

```powershell
tofu init -migrate-state -backend-config="bucket=aws-foundation-state-905418096305-eu-central-1"
tofu state list
tofu plan
```

Verify the cached `.terraform/terraform.tfstate` backend bucket equals
`aws-foundation-state-905418096305-eu-central-1`, and the key equals
`foundation/aws_account/tofu.tfstate`. Do not delete the old versions.

## 3 — Transfer Aggregator IAM state, preserving IAM identities

Move local operations to `aggregator/infra/administration`. If this is a
fresh directory after the rename, first initialize against the **original**
remote backend, then inspect and back up its actual resources:

```powershell
$env:AWS_PROFILE = "infra-admin"
tofu init -backend-config="bucket=aggregator-tofu-state-905418096305-eu-central-1" -backend-config="key=admin/tofu.tfstate"
tofu state list
```

If this root still owns Foundation-wide resources (including `infra-admin`
or the account-wide OIDC provider), STOP and complete their non-destructive
ownership transfer first. If it already tracks
`aws_s3_bucket.aggregator_state`, STOP; the interim design was applied
and the bucket's state needs a separate non-destructive transfer.

Next change the backend to the new, existing administrative bucket:

```powershell
tofu init -migrate-state
tofu state list
tofu plan
```

Verify new backend bucket and `aggregator/tofu.tfstate` key. Existing IAM
resource addresses are unchanged by the folder move; no IAM user, group,
policy or GitHub role should be re-created. Review and apply only the IAM
permission updates, including `AggregatorStateBucketManagement` attached
to `AggregatorBaseAccess`, and temporary **dual** old/new workload state
permissions. The admin state is protected by a bucket policy denying
`aggregator-admin` even if it has ReadOnlyAccess.

**Do not** copy any old `admin/*` state into the project-managed bucket.

## 4 — Create the delegated project-state bucket

Only after the permission policy is applied, run `infra/state` as
`aggregator-admin`. No active `backend.tf` exists initially; this is
a controlled local-to-S3 OpenTofu bootstrap.

```powershell
$env:AWS_PROFILE = "aggregator-admin"
tofu init
tofu validate
tofu plan
# After reviewing the entire plan:
tofu apply
Copy-Item backend.s3.tf.example backend.tf
tofu init -migrate-state
tofu state list
tofu plan
```

Check the `aggregator-project-tofu-state-905418096305-eu-central-1`
bucket and `state/tofu.tfstate` object. It must contain *only*
the bucket and its own security/lifecycle resources, not project IAM.

## 5 — Migrate demo and publication state

Keep the publication runner and GitHub demo pipeline frozen.
The IAM policies installed in step 3 retain old and new S3
permissions so the operator can read the old state and write the new one.

In each root (`infra/demo`, `deploy/infra/publication`), from the
previously initialized backend use the delegated operator and run:

```powershell
$env:AWS_PROFILE = "aggregator-admin"
tofu state list
# Create a secure backup of the current state before continuing.
tofu init -migrate-state
tofu state list
tofu plan
```

If this is a fresh checkout with no prior initialized backend, first
explicitly initialize the old bucket with the matching old key
(`demo/tofu.tfstate` or `publication/tofu.tfstate`), verify the
nonempty state, and then run `tofu init -migrate-state` to the new bucket.

Compare resource addresses before/after. Inspect plans closely.
**Never recreate or destroy** the legacy serving EC2 instance,
its Elastic IP, or publication resources just because the backend changed.

## 6 — Promote CI, verify, then clean up

Only after both migrations have passed, merge the relevant `dev`
changes into `demo` and re-enable the workflows. The S3 saved-plan
script now writes to the project bucket under
`plans/demo/<run-id>/<attempt>/demo.tfplan`. Re-run validation and
test plan upload/download checksum and protected apply with a fresh run.
Invalidate all earlier saved plans; never apply a plan generated against
old backend state.

After monitoring successful live runs, make a *separate* cleanup change
removing temporary old-bucket permissions from
`infra/administration/state.tf`,
`state_access.tf` and `policies/AggregatorDemoInfraPlanState.json`.
Do not weaken the old bucket deny until its privileged state is gone.

The legacy bucket remains in AWS with historical versions, even after
Foundation forgets its ownership. Its secure retirement requires a later
review of every consumer, object, version and lock. It must **not**
be deleted automatically by the new project state root.

## Validation and rollback

For each stage check AWS identity, backend bucket/key, `tofu state list`,
S3 object presence and `tofu plan`. Stop on any destroy/replace of
existing resources. Retain encrypted offline state backups and S3 versions
for controlled recovery. Never use `-force-copy`, `-reconfigure` to
silently bypass migration, `force_destroy = true`, or direct S3 copying
as a substitute for backend migration.
