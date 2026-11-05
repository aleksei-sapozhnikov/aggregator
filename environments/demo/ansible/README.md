# K3s node configuration

Ansible configures the separate Amazon Linux 2023 K3s EC2. It does **not**
manage the serving Compose instance or application image releases.

| Role     | Responsibility                                                                 |
| -------- | ------------------------------------------------------------------------------ |
| `common` | System packages and SSM Agent                                                  |
| `k3s`    | Pinned single-node K3s, Traefik HTTPS/ACME, ServiceLB, API readiness           |
| `argocd` | Pinned Argo CD install, server rollout and local-only UI forwarding            |
| `gitops` | `aggregator-demo` Application pointing at `deploy/demo-gitops:deploy/k8s-live` |

Versions live in [group_vars/all.yml](group_vars/all.yml).
Traefik is configured using the K3s-packaged `HelmChartConfig`
[`traefik-config.yaml`](roles/k3s/files/traefik-config.yaml).
The file is copied to the K3s manifest directory through SSM/Ansible;
its certificate storage uses a local-path PVC. Let's Encrypt HTTP-01
validation requires the public domain to reach this node on port 80.

## How configuration runs

The approved [Demo pipeline](../WORKFLOW.md) invokes
`environments/demo/src/sh/dispatch-ansible-ssm.sh`, which runs the versioned
`environments/demo/src/sh/ssm-node-configure.sh` on the EC2 through AWS SSM.
The launcher locks the shared checkout, checks out the exact source
commit, runs `environments/demo/src/sh/node-configure.sh` and verifies K3s, Traefik,
Argo CD and the Application resource. The successful revision and
content-based configuration fingerprint are recorded only after success.

SSM reports logs to CloudWatch `/aws/ssm/aggregator-demo-k3s` and
`/var/log/aggregator-node-configure.log` on the instance. The workflow
compares the fingerprint on subsequent runs and skips unchanged Ansible
configuration; use `reapply_ansible=true` for a deliberate reapply.

The pinned K3s version is fixed, but its installer is downloaded from
`get.k3s.io` without a pinned installer checksum. Treat this as a demo
supply-chain limitation.

## Local code QA

The repository-wide `code_qa` orchestrator runs Ansible syntax checks,
offline `ansible-lint` (basic profile), YAML/format checks and node
configuration contract tests:

```sh
make qa-check MODULE=demo QA_SCAN_SECRETS=false
```

Run this on Linux or through WSL on Windows. QA installs pinned Ansible tools
into the ignored `.local/qa-runtime/ansible` directory and does not require
AWS credentials or an EC2 connection. The demo pipeline runs the same QA
module before planning infrastructure changes.

## Verify the node

Inside an authorized AWS Session Manager session:

```sh
sudo systemctl is-active amazon-ssm-agent
sudo systemctl is-active k3s
sudo k3s kubectl get nodes
sudo k3s kubectl get pods -n argocd
sudo k3s kubectl get applications -n argocd
sudo cat /var/lib/aggregator-node/last-configured-revision
sudo tail -100 /var/log/aggregator-node-configure.log
```

Cloud-init logs are at `/var/log/cloud-init-output.log`.
Configuration readiness is separate from application Synced/Healthy status.

## Argo CD password

Store secret `ARGOCD_PASSWORD` in the GitHub Environment
`demo-infra-apply`, protected by required reviewers. It must contain
16 or more characters and at most **72 UTF-8 bytes**, with no nulls or
line breaks. On approved apply, the workflow checks its bcrypt verifier
in `argocd-secret` via SSM and updates it only when different. It never
stores plaintext in Git or OpenTofu state.

To rotate: change the GitHub secret, dispatch `Demo pipeline` on
`deploy/demo` with `sync_argocd_password=true`, and approve the apply
environment. See [password tooling](../../../tools/argocd/README.md).
A local alternative is `python tools/argocd/src/sync_argocd_password.py`,
using an AWS identity authorized for `ssm:SendCommand` and a process-only
`ARGOCD_PASSWORD` variable; tunnel-only privileges are insufficient.

## Private dashboard

Argo CD is ClusterIP-only. Ansible maintains a port forward bound to
`127.0.0.1:18080` on the EC2. With AWS CLI and the Session Manager
plugin, connect through SSM:

```sh
aws ssm start-session --region eu-central-1 \
  --profile aggregator-admin \
  --target <k3s-instance-id> \
  --document-name AWS-StartPortForwardingSession \
  --parameters portNumber=18080,localPortNumber=8080
```

Keep the SSM session open, visit `https://localhost:8080`, accept the
self-signed certificate for this local tunnel, and sign in as `admin` with
the configured `ARGOCD_PASSWORD` in the protected `demo-infra-apply`
GitHub Environment. Close the session with Ctrl+C. If local port 8080 is
already in use, change `localPortNumber` and the browser URL together.

For a ready-to-run PowerShell example that discovers the K3s instance, see
[Hosted demo: Argo CD dashboard](../README.md#open-the-private-argo-cd-dashboard).
The current instance ID and an example tunnel command also appear in the
infrastructure apply job summary.
