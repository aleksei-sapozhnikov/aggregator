# Demo pipeline: operations

The public demo is a single K3s EC2, managed through OpenTofu, Ansible, and
Argo CD. Pushes to `deploy/demo` start
[`demo-infra.yml`](../../.github/workflows/demo-infra.yml). When ready, it
dispatches [`demo-deploy.yml`](../../.github/workflows/demo-deploy.yml).
A commit on `dev` alone never deploys.

## Branches

- `dev`: development and local QA.
- `deploy/demo`: source of K3s infrastructure, Ansible and application builds.
- `deploy/demo-gitops`: protected, fast-forward-only published Kubernetes
  manifests in `deploy/k8s-live`. Argo CD follows this branch.

Protect the GitOps branch against non-fast-forward writes and deletion.
Restrict the two infrastructure GitHub Environments to `deploy/demo`.

## Execution

1. **Detect and validate.** Classify infrastructure and application changes;
   validate the demo OpenTofu, Ansible and code QA contracts.
2. **Plan.** Use read-only OIDC in `demo-infra-plan` to generate an exact
   binary OpenTofu plan in the project state bucket at
   `plans/demo/<run-id>/<attempt>/demo.tfplan`, along with a SHA-256 digest.
   Review the plan summary before approval.
3. **Compare Ansible state.** Check the desired configuration fingerprint
   against the last successful SSM Parameter Store record. Missing or changed
   configuration triggers node reconciliation.
4. **Approve and apply.** Only when needed, use protected
   `demo-infra-apply` to download and verify the same plan, apply it, run
   approved node configuration over SSM and record success.
5. **Publish.** The independently dispatched Demo deploy workflow runs all
   QA, checks existing GHCR image tags, builds missing images, and promotes a
   staged `deploy/k8s-live` snapshot onto `deploy/demo-gitops`. Argo CD then
   syncs the `aggregator-demo` Application.

A successful infrastructure pipeline does not prove application or
certificate readiness. Verify the GitOps release and public HTTPS.

## GitHub Environments

| Environment | Settings | Protection |
| --- | --- | --- |
| `demo-infra-plan` | `AWS_ROLE_ARN` | Restrict to `deploy/demo`; no reviewers |
| `demo-infra-apply` | `AWS_ROLE_ARN`, secret `ARGOCD_PASSWORD`, `MANUAL_APPROVAL_CONFIGURED=true` | Restrict to `deploy/demo`; required reviewers |

K3s is always enabled and always owns the protected public Elastic IP.
No GitHub variable selects the hosting platform or EIP destination.
`AWS_ROLE_ARN` values come from
[administration](../shared/infra/administration/README.md). Use OIDC,
not stored AWS keys. Saved plans expire after seven days.

## Manual operations

- **Reconfigure Ansible:** when dispatch is available, run Demo pipeline on
  `deploy/demo` with `reapply_ansible=true`; approve the apply job.
- **Rotate the Argo CD password:** update `ARGOCD_PASSWORD` in
  `demo-infra-apply`, request `sync_argocd_password=true`, and approve.
- **Workflow dispatch:** manual workflow dispatch requires the YAML to exist
  on the default branch. Otherwise use a reviewed source push or the
  documented SSM procedure.

## Safeguards and recovery

- Demo apply must never destroy or replace `aws_eip.public`,
  `aws_eip_association.public` or the running K3s instance. The plan script
  checks destructive actions on these addresses. Review the **entire** plan,
  not only the summary; the EIP and K3s remain protected.
- Do not reapply a saved plan after a failed or partially completed apply.
  Generate a fresh plan against the actual AWS state.
- Do not replace or destroy the K3s EC2 casually: Prometheus, Grafana and
  Traefik certificate data use node-local persistent volumes.
- For AWS SSM errors, inspect CloudWatch Logs
  `/aws/ssm/aggregator-demo-k3s`, or
  `/var/log/aggregator-node-configure.log` on the node.
- For private access to Argo CD, use the
  [SSM tunnel](ansible/README.md#private-dashboard).

See [infrastructure](infra/README.md),
[Ansible](ansible/README.md) and
[K3s GitOps](../../deploy/kubernetes/README.md).
