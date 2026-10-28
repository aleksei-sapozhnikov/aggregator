# Argo CD administrator credential utilities

This directory owns Argo CD administrator password reconciliation. The
scripts are deployment utilities, not GitHub Actions or Ansible implementations.

- `sync-argocd-password.py` runs from GitHub Actions or a local workstation.
  It compares `ARGOCD_PASSWORD` with the current bcrypt verifier over AWS SSM
  and submits an updated verifier only when needed.
- `argocd-admin-hash.py` runs on the K3s node. Ansible installs it as
  `/usr/local/sbin/aggregator-argocd-admin-hash`. Its `read` and `apply`
  commands access the Kubernetes `argocd-secret` without accepting plaintext.

Changes to the node-side helper trigger an Ansible reapply through the demo
infrastructure workflow so the installed copy stays current.

## Tests

Run the tests and code quality checks for both utilities:

```sh
python tools/code_qa/src/main.py code-qa --module argocd
```

Tests mock AWS and Kubernetes access and do not need a live cluster.
See [Ansible credentials and access](../ansible/README.md#argo-cd-credentials-and-private-dashboard-access)
for rotation and [demo workflow](../infra/demo/WORKFLOW.md) for deployment details.
