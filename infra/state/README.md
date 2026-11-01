# Project state and private plans

This OpenTofu root, run as `aggregator-admin`, owns the project S3 bucket
`aggregator-project-tofu-state-905418096305-eu-central-1`: versioning,
encryption, public-access restrictions, ownership controls, and lifecycle.

| Prefix                                      | Contents                                  |
| ------------------------------------------- | ----------------------------------------- |
| `state/tofu.tfstate`                        | This bucket's own state                   |
| `demo/tofu.tfstate`                         | Demo EC2/K3s and SSM state                |
| `publication/tofu.tfstate`                  | Publication infrastructure state          |
| `plans/demo/<run-id>/<attempt>/demo.tfplan` | Private, checksum-verified approved plans |

Only `plans/demo/` is expired by lifecycle (current objects after seven
days; noncurrent versions after the configured short retention).
Administration IAM state must remain in the central Administration bucket.

## Operations

Use the delegated `aggregator-admin` identity in AWS account
`905418096305`, region `eu-central-1`. The tracked `backend.tf` points
to the existing project state bucket. Run:

```sh
aws sts get-caller-identity
tofu init -input=false -lockfile=readonly
tofu validate
tofu plan
```

The bucket bootstrap is complete. Never initialize an empty state or
recreate this S3 bucket. Do not commit state, backend credentials, plans
or private variable values.
