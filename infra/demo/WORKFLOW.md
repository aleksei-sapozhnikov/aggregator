# Demo pipeline: operations

[`demo-infra.yml`](../../../.github/workflows/demo-infra.yml) is the automatic
entry point for a push to `deploy/demo`. It checks infrastructure and node
configuration **before** dispatching [`demo-deploy.yml`](../../../.github/workflows/demo-deploy.yml).
A commit on `dev` alone never deploys.

## Branches

- `dev`: development and local QA.
- `deploy/demo`: candidate source for Compose, OpenTofu, Ansible and K3s.
  It may be force-pushed from tested `dev`.
- `deploy/demo-gitops`: protected, append-only published Kubernetes
  manifests at `deploy/k8s-live`. GitHub Actions publishes by
  **fast-forward only**. Argo CD tracks this branch, not source history.

Protect `deploy/demo-gitops` against deletion and non-fast-forward updates.
Restrict deployment Environments to `deploy/demo`.

## Execution

1. **Detect and validate.** Determine source/infrastructure changes, validate
   OpenTofu and Ansible without AWS credentials.
2. **Plan (read-only OIDC).** Use `demo-infra-plan` to check AWS account
   `905418096305`, plan `infra/demo`, render the plan in the Actions Summary
   and save its exact binary form privately under
   `plans/demo/<run-id>/<attempt>/demo.tfplan` in the project state bucket.
   Pass a SHA-256 checksum to the apply job.
3. **Decide whether Ansible is needed.** Compare tracked node configuration
   and the current EC2 ID against the last successful SSM Parameter Store
   value (`/aggregator/demo/ansible/last-successful-config-sha256`).
   Changes, a missing record, a new instance or manual reapply require
   configuration. Ordinary application edits do not.
4. **Approve and apply.** If OpenTofu or Ansible changes are needed, use
   the protected `demo-infra-apply` Environment. Download and verify
   the **same** saved plan; skip `tofu apply` on a no-op. Configure K3s,
   Traefik and Argo CD through SSM, then record the successful configuration
   fingerprint. Errors leave the previous success marker untouched.
5. **Deploy the application.** After successful infrastructure stages, dispatch
   `Demo deploy` for application changes or a missing K3s release.
   That independent workflow runs full QA, builds only missing GHCR image
   tags, deploys the serving Compose instance via SSM, then publishes
   `deploy/k8s-live` on `deploy/demo-gitops` for Argo CD to sync.

A successful infrastructure workflow **does not** prove the application
workflow or Argo CD sync succeeded. Check both Actions runs.

## Required GitHub Environments

| Environment | Required settings | Protection |
| --- | --- | --- |
| `demo-infra-plan` | `AWS_ROLE_ARN`, `ENABLE_K3S_NODE`, `ENABLE_BEDROCK` | Only `deploy/demo`; **no required reviewers** |
| `demo-infra-apply` | `AWS_ROLE_ARN`, secret `ARGOCD_PASSWORD`, `MANUAL_APPROVAL_CONFIGURED=true` | Only `deploy/demo`; **required reviewers** |
| `demo` | `AWS_DEMO_DEPLOY_ROLE_ARN`, `SSM_INSTANCE_ID` | Only `deploy/demo` |

Use IAM role ARNs from `infra/administration`. The OIDC trust uses
Environment subjects, so the allowed-branch restrictions above are
mandatory. Do not store AWS access keys in GitHub.

The plan role reads infrastructure/state and can upload only a
conditional, unique S3 plan object. The apply role can read that plan,
apply approved infrastructure, run SSM and record the fingerprint.
Plans expire from the private S3 prefix after seven days; if a plan expires
before approval, generate a fresh one.

## Manual operations

- **Reconfigure Ansible:** Actions → Demo pipeline → Run workflow on
  `deploy/demo` with `reapply_ansible=true`; approve the apply environment.
- **Rotate the Argo CD password:** update `ARGOCD_PASSWORD` in
  `demo-infra-apply`, then dispatch with `sync_argocd_password=true` and
  `reapply_ansible=false`; approve the apply job. Only a bcrypt verifier
  is sent through SSM. The password is never stored in OpenTofu state.
- **Manual dispatch caveat:** GitHub exposes `workflow_dispatch` only when
  the workflow file is present on the repository default branch. Otherwise,
  use a reviewed source push or an authorized SSM procedure.
- **Disable K3s:** set `ENABLE_K3S_NODE=false` and inspect the destruction
  plan carefully. K3s local-path PVC data is not durable across instance
  deletion. The serving Compose EC2 must not be replaced.

An unchanged OpenTofu plan and matching Ansible fingerprint do not need
an infrastructure apply. A manually requested password sync still uses
the protected apply environment.

## Troubleshooting and safety

- Inspect both workflow job summaries, AWS account identity, planned
  resource actions and saved-plan checksum before approval.
- If apply fails, **do not reuse the saved plan**: investigate, refresh IAM
  through `infra/administration` if required, and plan again against
  current state. Do not force-unlock or manually delete partly created resources.
- Inspect SSM Run Command output in CloudWatch
  `/aws/ssm/aggregator-demo-k3s` (14-day retention), or on the node at
  `/var/log/aggregator-node-configure.log`.
- Ansible waits for K3s/Traefik/Argo CD, not application pods or public HTTP.
  Verify Argo CD **Synced/Healthy** and the public K3s endpoint separately.
- No inbound SSH, public Kubernetes API or public Argo CD UI is required.
  Use the private SSM tunnel documented in [Ansible](ansible/README.md).

See [demo infrastructure](README.md), [Compose deployment](../../deploy/demo/README.md),
and [K3s GitOps](../../deploy/k8s/README.md).
