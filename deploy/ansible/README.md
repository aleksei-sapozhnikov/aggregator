# Ansible configuration for the K3s node

The playbook configures only the **new**, single-node Amazon Linux 2023 EC2
instance. It does not modify the currently serving Docker Compose demo.

- `common` installs node administration/network packages and enables SSM Agent.
- `k3s` configures the server, installs a pinned K3s version, and waits for the
  Kubernetes API. The bundled Traefik ingress and ServiceLB are enabled.
- `argocd` applies a pinned upstream Argo CD manifest in the `argocd`
  namespace with server-side apply and waits for the server rollout.
- `gitops` registers the `aggregator-demo` Argo CD Application, tracking
  the `demo` branch's published `deploy/k8s-live` directory.

Pinned versions are in [group_vars/all.yml](group_vars/all.yml). Argo CD manages
the applications defined in `deploy/k8s`, while Ansible manages cluster
bootstrapping. The existing Docker Compose demo remains unchanged.

## Execution and reconciliation

On first boot, cloud-init installs Git and Python 3.12 and writes a
root-owned wrapper, but does **not** run Ansible. After Terraform apply,
GitHub Actions invokes that wrapper through AWS SSM using the triggering
commit SHA. The same SSM command is used for later Ansible revisions.

The wrapper `/usr/local/sbin/aggregator-node-configure` accepts only
an exact 40-character lowercase Git SHA. It creates the isolated Ansible
virtual environment when necessary, fetches that commit, executes
`site.yml` as root, and records success in
`/var/lib/aggregator-node/last-configured-revision`. A lock prevents
overlapping playbooks. A failed run can be retried against the same VM
without recreating it. For example, via SSM:

```sh
sudo /usr/local/sbin/aggregator-node-configure <40-character-git-commit-sha>
```

K3s is reinstalled only if the installed pinned version differs. The
Argo CD manifest is reapplied to reconcile drift. On a new node, the
GitHub SSM job waits for cloud-init and checks K3s, Traefik, Argo CD and
the registered Application resource after configuration. It does not
wait for application sync or HTTP endpoints.

The K3s installer comes from the official `get.k3s.io` endpoint, with
`INSTALL_K3S_VERSION` pinned. The installer script itself is not pinned
to a SHA256 checksum; review this supply-chain limitation before using the
demo configuration in a production environment.

## Verification on the EC2 instance

```sh
sudo systemctl is-active amazon-ssm-agent
sudo systemctl is-active k3s
sudo /usr/local/bin/k3s kubectl get nodes
sudo /usr/local/bin/k3s kubectl get pods --namespace argocd
sudo /usr/local/bin/k3s kubectl --namespace argocd rollout status deployment/argocd-server
sudo cat /var/lib/aggregator-node/last-configured-revision
sudo tail -100 /var/log/aggregator-node-configure.log
```

On first-boot failure, also inspect `/var/log/cloud-init-output.log`.
The GitHub infrastructure workflow waits for cloud-init, applies the exact
workflow revision and checks K3s and Argo CD readiness using SSM. Full output is
forwarded to CloudWatch Logs group `/aws/ssm/aggregator-demo-k3s` and retained
for 14 days.
Argo CD remains reachable only inside the cluster (ClusterIP service).
The public entrypoint is Traefik port 80, serving the UI Caddy via a hostless
Ingress. Neither Argo CD nor the Kubernetes API is publicly exposed.

## Argo CD credentials and private dashboard access

The pinned `install.yaml` is the **full non-HA Argo CD installation**, not
`core-install.yaml`. It already provides the web dashboard and API. The
`argocd-server` Service remains `ClusterIP`, never a public Ingress or
LoadBalancer.

### One-time AWS setup (required before enabling the new Ansible role)

1. Apply `deploy/infra/admin` as `infra-admin` **first**. This deploys
   an updated permission boundary for the K3s EC2 instance, permitting only
   `secretsmanager:GetSecretValue` on the fixed Argo CD password secret,
   and lets the demo IAM group use the standard SSM port-forwarding document.
   This permission boundary is not updated by the demo workflow.
2. In AWS Secrets Manager (region `eu-central-1`), create a **plain-text**
   secret named `aggregator/demo/argocd-admin`. Choose a strong random
   password (16–72 UTF-8 bytes), without storing it in Git, Terraform
   variables, CI secrets, instance user-data, or a shell command argument.
   Sign in as `aggregator-admin` and add the tags `Project=aggregator`
   and `Environment=demo` when creating the secret; its scoped IAM policy
   requires these tags.
   Use the default `aws/secretsmanager` encryption key. This secret's
   **value is managed in Secrets Manager**, not Terraform, so changing it
   must not be reverted by an infrastructure apply.
3. Apply `deploy/infra/demo` through the reviewed workflow. The K3s EC2
   role now has permission to **read only this named secret**, not all AWS
   secrets. The secret must already have a value before Ansible runs.

The Ansible `argocd` role installs an isolated reconciliation program,
root-owned systemd service, and a timer which checks Secrets Manager around
every five minutes. On the first run, and whenever the AWS password differs
from the bcrypt hash stored in Kubernetes `argocd-secret`, it updates
`admin.password` and `admin.passwordMtime` in Kubernetes. The initial
generated password secret is deleted after successful rotation. The password
is **never** passed to Ansible as a variable or stored in a Terraform state
file. Only a bcrypt hash is written to a temporary root-only patch file.

Changing the AWS secret does not require a new Git commit, a new EC2, or
manually restarting Ansible: the systemd timer applies it automatically,
normally within five minutes. Failures appear via
`sudo journalctl -u aggregator-argocd-admin-reconcile.service` on the node.
The timer requires the instance profile to be able to reach the AWS
Secrets Manager endpoint and the Argo CD Kubernetes API. A custom KMS key
would require additional specifically scoped KMS permissions and is not
configured here.

### Open the dashboard using one SSM session

Ansible keeps a `kubectl port-forward` process running as a root-owned
systemd service, bound **only** to `127.0.0.1:18080` on the EC2 instance.
It is restarted automatically if the Kubernetes connection drops. Port
18080 is **not** opened in the EC2 security group.

From the repository root on Windows or Linux, prefer:

```sh
python run-tools.py argocd connect --profile aggregator-admin
```

The tool resolves the currently running K3s EC2 from AWS tags. To print a
one-line connection command rather than start the tunnel, use
`python run-tools.py argocd instructions --profile aggregator-admin`.
To create or update the AWS password secret securely via a hidden input
prompt, run `python run-tools.py argocd password set --profile aggregator-admin`
(requires local `boto3`); `python run-tools.py argocd password` prints
the secret's AWS Console link without retrieving its value. See
[the Argo CD CLI README](../../tools/argocd_access/README.md).

Alternatively, with AWS CLI, Session Manager plugin, and a demo IAM identity
permitted to start SSM port-forwarding sessions, run on a **local Windows PC**:

```powershell
aws ssm start-session --region eu-central-1 `
  --target i-REPLACE_WITH_K3S_INSTANCE_ID `
  --document-name AWS-StartPortForwardingSession `
  --parameters portNumber="18080",localPortNumber="8080"
```

Then browse to `https://localhost:8080` (the default certificate is
self-signed). Log in as `admin` with the value of the AWS Secrets Manager
secret. The tunnel ends when the local SSM session closes. The EC2 side is
managed by Ansible; no additional terminal or persistent workstation process
is required.

Useful instance checks:

```sh
sudo systemctl status aggregator-argocd-ui-forward.service
sudo systemctl status aggregator-argocd-admin-reconcile.timer
sudo journalctl -u aggregator-argocd-admin-reconcile.service --no-pager -n 30
```

This protects the control-plane dashboard while letting you inspect the
`aggregator-demo` Application, health, sync status, history, and resource
tree. Never expose the admin dashboard through the public HTTP-only
Aggregator ingress.

## GitOps workload bootstrap

The `gitops` role creates the Argo CD Application; it does not deploy
containers directly. The Application watches `demo:deploy/k8s-live`, generated after
successful GHCR image builds from `demo`. SSM verifies infrastructure
only; when no published manifests exist, the infrastructure workflow
dispatches `demo-deploy` after Ansible succeeds. The Kubernetes resources
and release procedures are documented in
[deploy/k8s/README.md](../k8s/README.md).
