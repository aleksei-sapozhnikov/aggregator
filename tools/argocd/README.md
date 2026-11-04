# Argo CD administrator password

Utilities to reconcile the demo K3s Argo CD administrator password without
keeping plaintext in Git or OpenTofu state. They manage credentials, not
Argo CD installation or application releases.

## Rotate through GitHub Actions

1. Set the `ARGOCD_PASSWORD` secret in the protected `demo-infra-apply`
   GitHub Environment.
2. Dispatch [Demo pipeline](../../environments/demo/WORKFLOW.md) on
   `deploy/demo` with `sync_argocd_password=true`.
3. Approve the infrastructure apply environment and verify the workflow
   succeeded. Access the dashboard through the private
   [SSM tunnel](../../environments/demo/ansible/README.md#private-dashboard).

The password must contain at least **16 characters** and at most
**72 UTF-8 bytes**, with no newlines or null bytes.

## Local alternative

With an AWS identity authorized to run SSM commands on the K3s instance,
set `ARGOCD_PASSWORD` in the process environment and run:

```sh
python tools/argocd/src/sync_argocd_password.py
```

This requires Python with `boto3` and `bcrypt` plus AWS credentials for
account `905418096305`, region `eu-central-1`. It discovers the
running tagged K3s instance, or uses `SSM_INSTANCE_ID` when supplied.
The helper compares against the current bcrypt verifier and updates it only
when necessary. Only the verifier is sent to the node through SSM; the
installed node-side helper updates Kubernetes `argocd-secret`.
Session Manager tunnel access alone is insufficient for this operation.

Run tests using the `argocd` module in
[Code QA](../code_qa/README.md). See
[Ansible operations](../../environments/demo/ansible/README.md) for
configuration and access.
