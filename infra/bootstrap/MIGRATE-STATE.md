# Migrate Aggregator OpenTofu state to its own S3 bucket

This is a staged migration. **Committing these files does not create a bucket,
move any state, or switch any remote backend.** The current
`aggregator-tofu-state-905418096305-eu-central-1` bucket is owned by
`aws_foundation/account`, which also uses it for
`foundation/account/tofu.tfstate`. Never remove that bucket as part of the
Aggregator migration.

The new, Aggregator-owned bucket is
`aggregator-project-tofu-state-905418096305-eu-central-1`. It is declared in
`infra/bootstrap/state_bucket.tf` alongside the Aggregator IAM policies.
It has versioning, encryption, public-access blocks, explicit transport and
administrator-state denies, and a seven-day Lifecycle scoped to
`plans/demo/`. The new bucket must be created **while infra/bootstrap still
uses the existing backend**. Once it exists, the same root can own the bucket
while storing its own state in it.

## Stage 1 - Create the new bucket without migrating state

1. Use `infra-admin` AWS credentials and `infra/bootstrap` on the `dev`
   branch. Do not modify `backend.tf` yet.
2. Run `tofu init -lockfile=readonly`, `tofu validate` and `tofu plan`.
   Expect creation of only the new `aws_s3_bucket.aggregator_state`,
   its security controls and lifecycle, plus its output.
3. Inspect the **complete** plan. No existing state bucket, IAM user, EC2
   or workload should be destroyed or replaced.
4. Run the approved `tofu apply` with `infra-admin`. Keep local state,
   plans and credentials outside Git. Verify the new bucket's name via
   `tofu output -raw aggregator_state_bucket_name`.

Stop here until this stage succeeds. **The current `demo` GitHub workflow,
state and plan transfers still use the old bucket.** Do not promote a
future switched backend to `demo` before the later stages are complete.

## Stage 2 - Prepare access and freeze writers

This stage requires a separate reviewed change after the new bucket exists:

- Allow `aggregator-admin` read/write of only
  `demo/tofu.tfstate`, `publication/tofu.tfstate` and their individual
  `.tflock` objects **in the new bucket**. Retain temporary old-bucket
  access until migration is verified.
- Give the unapproved demo planning role read-only state access plus its
  lock access in the new bucket; allow only conditional `PutObject`
  for `plans/demo/*`. Give the approved apply role its required state
  access plus `GetObject` for `plans/demo/*`.
- Update the shared plan-transfer script to point to the new bucket.
  Do not run its new workflow yet.
- Temporarily stop all `demo`, publication, and project-bootstrap applies,
  scheduled jobs, and in-flight approvals. Avoid concurrent writers during
  backend migration.
- Keep `aws_foundation/account` managing the **old** bucket because its
  own state is stored there; do not move Foundation state unless a separate
  decision is made.

Review and apply the access changes with `infra-admin` before migrating
any delegated `aggregator-admin` backend.

## Stage 3 - Migrate the three Aggregator backends

After access has been prepared, change only the bucket names in:

- `infra/bootstrap/backend.tf`: key stays `admin/tofu.tfstate`.
- `infra/demo/backend.tf`: key stays `demo/tofu.tfstate`.
- `deploy/infra/publication/backend.tf`: key stays `publication/tofu.tfstate`.

Preserve each root's region, `encrypt = true`, and `use_lockfile = true`.
For every root, with its existing initialized backend and AWS identity,
run `tofu init -migrate-state` and explicitly approve copying the state.
Migrate `infra/bootstrap` as `infra-admin`; use authorized
`aggregator-admin` for the demo and publication roots after their new
policies have been applied.

Use each root's normal OpenTofu state subcommands to back up and compare
the resource addresses and counts before and after migration. The new
state must contain exactly the existing resources; **do not import or
recreate resources that are already tracked**.

Run `tofu plan` in all three roots after migration. Expect no AWS changes.
If any plan proposes creating or destroying existing infrastructure,
do not apply it. Restore access and investigate the backend migration.

## Stage 4 - Switch workflows and remove temporary access

Only after all state migrations pass:

- Deploy the `demo` workflow that reads/writes plans under the new
  `plans/demo/` prefix and verify SHA-256 matching in one approved run.
- Remove temporary permissions to the old Aggregator state keys from
  Aggregator IAM, leaving only permissions to the new bucket.
- Remove the now-obsolete `plans/demo/` Lifecycle and conditional-write
  guard from `aws_foundation/account`. It **continues to own its original
  bucket**, because that bucket still contains Foundation state.
- Verify all active workflows and interactive OpenTofu operations use the
  new bucket. Historical copies of Aggregator state may remain versioned
  in the old bucket and require a separately reviewed secure cleanup;
  `tofu init -migrate-state` does not guarantee the source objects and
  versions are deleted.

Never use `-force`, `force_destroy = true`, manual S3 object copying as
a substitute for state migration, or `tofu state rm` to solve migration
problems. No OpenTofu state keys are renamed.
