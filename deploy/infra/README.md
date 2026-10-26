# AWS infrastructure

Each directory is an independent OpenTofu root with its own S3 state key.
The roots can be maintained separately in source control, but depend on shared
AWS resources and delegated permissions. Do not apply them as if they were
disposable environments.

- [admin](admin/): IAM identities, delegated policies, permissions
  boundaries, and the protected state bucket (`admin/tofu.tfstate`).
- [demo](demo/): Public demo EC2 instance, network access, IAM role/profile,
  and Elastic IP (`demo/tofu.tfstate`).
- [publication](publication/): GitHub publication Lambda, Scheduler watchdog,
  DynamoDB, snapshots, secrets containers, and notifications
  (`publication/tofu.tfstate`).

## Ownership and initialization

1. Bootstrap the remote state bucket and the administrative identity through
   separately authorized AWS operations. The `admin` root then manages them;
   its own backend cannot create the bucket during `tofu init`.
2. Apply `admin` using `infra-admin` or equivalent privileges. It manages the
   policies required by the other roots; it must not be administered using the
   delegated `aggregator-admin` user.
3. Initialize `demo` and `publication` independently with their delegated AWS
   permissions. Both assume the state bucket and their IAM policies exist.
   `publication` additionally requires the bootstrap Lambda code object and a
   configured notification email secret value.

The region is `eu-central-1` and the AWS account is pinned in each provider.
Source-code independence does **not** remove the external prerequisites listed
in each root's README.

## Operational boundaries

- Review `tofu plan` before every apply. These roots manage existing live
  resources and use `prevent_destroy` on critical objects. Avoid replacing
  resources simply to normalize historical names or descriptions.
- The serving demo uses a legacy EC2 module. The optional k3s module is not
  enabled and does not install Kubernetes.
- Application rollout, Lambda code deployment, publication queue schedules,
  and GitHub token values are separate operations. The publication root
  deliberately ignores updates to Lambda code made by its code deployer.
- Secrets, state, saved plans, local variables, and ZIP artifacts must not be
  committed. The SNS email endpoint is looked up from Secrets Manager but
  remains present in OpenTofu state.
- Keep the minimal placeholder `.tf` files in each root for the configured
  strict TFLint file conventions; they document that inputs or outputs are
  intentionally absent.

For command examples and limitations, use each root's README. Static code QA
checks are described in [tools/code_qa](../../tools/code_qa/README.md).
