# Deployment Branch Cutover

This is a one-time migration from `demo` to two separate branches:

- `deploy/demo`: force-pushable application and infrastructure source.
- `deploy/demo-gitops`: append-only published Kubernetes configuration.

The former `demo` branch remains untouched until cutover verification. Do not
force-push the source branch before completing the prerequisites below.

## Prepared state

`deploy/demo-gitops` was initialized as an orphan history from the last
published `demo:deploy/k8s-live` snapshot. Its first commit is
`8893cd2a4b2a5fa6177445a8095119f227174573`, with eight tracked
`deploy/k8s-live` files and no parents. The Argo CD Application still tracks
the legacy `demo` branch until Ansible reconciles it.

The `dev` branch contains new workflow source and the Ansible template for
the separated deployment branches. `deploy/demo` must not be promoted until
the IAM policies and GitHub environments are prepared.

## Prerequisites

1. Re-enable the GitHub `Protect GitOps history` branch ruleset after
   initializing the orphan branch. Keep deletion and non-fast-forward pushes
   disabled for `deploy/demo-gitops`. Ordinary fast-forward CI publication
   must remain allowed. Keep deletion disabled for both `deploy/*` branches.
2. Apply `infra/administration` with the authorized `infra-admin` identity.
   The new scoped IAM policies grant `ssm:GetParameter` to the read-only
   planning role and `ssm:PutParameter` to the approved apply role.
   This root is independent of the demo workload and must be applied first.
3. In GitHub Settings → Environments, change the allowed deployment
   branch to `deploy/demo` for each environment:
   `demo`, `demo-infra-plan`, and `demo-infra-apply`.
   Keep `demo-infra-plan` without approval requirements; retain required
   reviewers and `MANUAL_APPROVAL_CONFIGURED=true` for `demo-infra-apply`.
   Do not alter existing environment names, secrets, or AWS_ROLE_ARN.
4. Verify the `deploy/demo-gitops:deploy/k8s-live/kustomization.yaml`
   manifest still exists, and that the GitOps ruleset is active.
5. Check the required `ENABLE_K3S_NODE` and `ENABLE_BEDROCK` values in
   `demo-infra-plan`. The old `DEMO_INFRA_WORKFLOW_ENABLED` switch is not
   used.

## Promote the source branch

After the prerequisites, use a lease-checked update of
`deploy/demo` from the tested `dev` branch:

```bash
git fetch origin
git push --force-with-lease origin origin/dev:refs/heads/deploy/demo
```

The source branch push starts `Demo pipeline`:

1. Validate and plan the existing `infra/demo` root. The SSM deployment
   document must be updated once to use `deploy/demo`; carefully review
   any additional plan changes before approval. Do not assume a no-op plan.
2. Compare the desired node configuration fingerprint against the last
   successful fingerprint in SSM Parameter Store. A missing initial parameter
   requires an approved Ansible run; the new GitOps Application target is
   `deploy/demo-gitops`.
3. Following approval and successful configuration, store the successful
   fingerprint in SSM Parameter Store and dispatch `Demo deploy`.
4. Publish missing GHCR images, update the Compose demo through the revised
   SSM document, and publish manifests with an ordinary fast-forward commit
   to `deploy/demo-gitops`.

## Verification

- `Demo pipeline` reports the correct AWS account and no unexpected EC2
  replacement or destructive OpenTofu changes.
- The approved apply step completes any SSM document update and node
  configuration; the successful fingerprint has the expected EC2 ID.
- `Demo deploy` checks out `deploy/demo`, publishes a fast-forward GitOps
  commit, and does not force-push `deploy/demo-gitops`.
- The Argo CD `aggregator-demo` Application has
  `targetRevision: deploy/demo-gitops` and path `deploy/k8s-live`.
- Argo CD reports Synced/Healthy, and the application is reachable.
- Future force pushes to `deploy/demo` never delete the published
  GitOps manifests. Repeated deployments with no OpenTofu changes skip
  `tofu apply`; matching successful Ansible fingerprints skip Ansible.

Keep the old `demo` branch until verification is complete. Do not delete
the old branch or remove legacy IAM permissions as part of this cutover.
