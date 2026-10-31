# Aggregator project state storage

This OpenTofu root is **executed by `aggregator-admin`**, using permissions
granted by `infra/administration`. It creates only the Aggregator-owned
`aggregator-project-tofu-state-905418096305-eu-central-1` bucket and its
versioning, default encryption, public-access block, ownership controls,
private plan lifecycle, and conditional plan-write policy.

Unlike the privileged IAM administration state, the project bucket holds
only workload state and approved-plan artifacts:

```text
state/tofu.tfstate
demo/tofu.tfstate
publication/tofu.tfstate
plans/demo/<run-id>/<attempt>/demo.tfplan
```

The seven-day Lifecycle applies **only** to `plans/demo/`. Do not store
IAM administration state or IAM secrets in this bucket. The user who manages
this bucket cannot access the protected Foundation/Administration buckets.

## First initialization

The bucket cannot be a remote backend until it exists. For the first
apply, `backend.tf` must be **absent**. Use a protected **local state**,
create the bucket with the authorized delegated user, then migrate that
local state into the newly created bucket:

```powershell
$env:AWS_PROFILE = "aggregator-admin"
tofu init
tofu validate
tofu plan
# Review the complete plan, then run: tofu apply
Copy-Item backend.s3.tf.example backend.tf
tofu init -migrate-state
tofu state list
tofu plan
```

Keep local state backups outside Git, secure temporary files, and verify
the remote key is `state/tofu.tfstate`. `backend.tf` is intentionally
gitignored only in this initial-creation root. Once it is activated,
all later operations use the remote backend.

See [the full migration runbook](../MIGRATE-STATE.md) before changing
any `demo` or `publication` backends.
