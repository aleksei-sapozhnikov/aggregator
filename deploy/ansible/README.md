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

The pinned `install.yaml` is the **full Argo CD installation**, including
its Web UI. The `argocd-server` Service is ClusterIP; no public Argo CD
ingress, LoadBalancer, SSH port, or Kubernetes API port is exposed.

### Administrator password in GitHub Environment

Set one environment secret before the first K3s deployment:

- GitHub **Settings → Environments → `demo-infra-apply` → Environment
  secrets → Add secret**, named `ARGOCD_ADMIN_PASSWORD`.
- Enter a strong password of 16-72 UTF-8 bytes, without line breaks.
- Keep the existing required-reviewer protection on that environment.

The plaintext is available only to the **approved** `apply` job and is
**not** passed to OpenTofu during plan/apply, written to Terraform state,
saved in workflow artifacts, or uploaded to the EC2 instance. After Ansible
installs Argo CD, a dedicated GitHub Actions step reads the current bcrypt
hash from `argocd-secret` over AWS SSM, then verifies the GitHub password
with `bcrypt.checkpw`. If they match, no change is made. If they differ,
the runner generates a new bcrypt hash, sends **only that hash** using
SSM Run Command, and updates `admin.password` and
`admin.passwordMtime`. The installer-generated initial secret is removed
after the first successful update.

This is not a Terraform resource: the password stays separate from the
saved infrastructure plan for security. Changing the GitHub Environment
secret does **not** trigger a workflow by itself. To rotate the password,
edit the secret and start a fresh **approved** demo-infra run (after
`workflow_dispatch` is available on the default branch, select
`sync_argocd_password=true` and `reapply_ansible=false`). Until
then, a reviewed update to the Ansible configuration and push to `demo`
can trigger the same Apply job. Only runs that execute the approved Apply
job reconcile the password; application-only deploys do not.

Only the bcrypt verifier is exposed to the AWS SSM Run Command API
and Kubernetes. It must still be handled carefully because password hashes
can be brute-forced offline. The helper never prints that verifier in
GitHub Actions logs.

### Connect to the dashboard

Ansible runs a local `kubectl port-forward` service on the EC2 instance,
bound to `127.0.0.1:18080` and restarted by systemd. To connect from
Windows or Linux, install AWS CLI and the Session Manager plugin, then use
the repository's portable command:

```sh
python run-tools.py argocd connect --profile aggregator-admin
```

It finds the current K3s instance through AWS EC2 tags and opens one
local SSM tunnel; browse to `https://localhost:8080`, accept the
development self-signed certificate and use `admin` with the password
from the GitHub Environment. To print the concrete AWS CLI command
without connecting, run
`python run-tools.py argocd instructions --profile aggregator-admin`.

Alternatively, use the one-line command printed in the infrastructure
Apply Summary, including the actual current instance ID. Access is still
restricted by AWS IAM and no inbound EC2 security-group port is needed.

Checks on the node:

```sh
sudo systemctl status aggregator-argocd-ui-forward.service
sudo /usr/local/bin/k3s kubectl -n argocd get deployment argocd-server
```

## GitOps workload bootstrap

The `gitops` role creates the Argo CD Application; it does not deploy
containers directly. The Application watches `demo:deploy/k8s-live`, generated after
successful GHCR image builds from `demo`. SSM verifies infrastructure
only; when no published manifests exist, the infrastructure workflow
dispatches `demo-deploy` after Ansible succeeds. The Kubernetes resources
and release procedures are documented in
[deploy/k8s/README.md](../k8s/README.md).
