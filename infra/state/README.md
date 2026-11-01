# Project state and private plans

This OpenTofu root, run as `aggregator-admin`, owns the project S3 bucket
`aggregator-project-tofu-state-905418096305-eu-central-1`: versioning,
encryption, public-access restrictions, ownership controls, and lifecycle.

| Prefix | Contents |
| --- | --- |
| `state/tofu.tfstate` | This bucket's own state |
| `demo/tofu.tfstate` | Demo EC2/K3s and SSM state |
| `publication/tofu.tfstate` | Publication infrastructure state |
| `plans/demo/<run-id>/<attempt>/demo.tfplan` | Private, checksum-verified approved plans |

Only `plans/demo/` is expired by lifecycle (current objects after seven
days; noncurrent versions after the configured short retention).
Administration IAM state must remain in the central Administration bucket.

## Operations

Use the delegated `aggregator-admin` identity in AWS account
`905418096305`, region `eu-central-1`. After `backend.tf` has been
configured from `backend.s3.tf.example`, run:

```sh
aws sts get-caller-identity
tofu init -input=false -lockfile=readonly
tofu validate
tofu plan
```

For a **brand-new bucket only**, initialize with protected local state,
review and apply the bucket creation, then copy the backend example to the
ignored `backend.tf` and run `tofu init -migrate-state`. Never start with
an empty backend when an existing state should already be present.
Do not commit state, backend credentials, local plans or variables.
