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

## Accessing the Argo CD web UI privately

The pinned `install.yaml` is the **full non-HA Argo CD installation**, not
`core-install.yaml`. It already includes the `argocd-server` Web UI and
API. The `argocd-server` Service is `ClusterIP` and is deliberately not
published through Traefik, the EC2 security group or a public LoadBalancer.

Once the K3s instance is recreated, use **two local terminal windows** to
access the dashboard from a workstation with AWS CLI, the Session Manager
plugin and IAM permission to start interactive SSM sessions on this instance.

1. Open an interactive SSM shell on the K3s instance:

   ```sh
   aws ssm start-session --region eu-central-1 --target i-REPLACE_WITH_K3S_INSTANCE_ID
   ```

   In that **remote** shell, run and keep this foreground process running:

   ```sh
   sudo /usr/local/bin/k3s kubectl -n argocd port-forward \
     svc/argocd-server 18080:443 --address 127.0.0.1
   ```

2. From a **second local terminal**, forward your workstation's port 8080
   to port 18080 on the same instance. On Windows PowerShell:

   ```powershell
   aws ssm start-session --region eu-central-1 `
     --target i-REPLACE_WITH_K3S_INSTANCE_ID `
     --document-name AWS-StartPortForwardingSession `
     --parameters portNumber="18080",localPortNumber="8080"
   ```

3. Open `https://localhost:8080` in your browser. The default Argo CD
   certificate is self-signed, so the browser may display a certificate
   warning. Use the `admin` username. To retrieve the initial password,
   open another trusted SSM shell and run (do **not** print it in CI logs):

   ```sh
   sudo /usr/local/bin/k3s kubectl -n argocd \
     get secret argocd-initial-admin-secret \
     -o jsonpath='{.data.password}' | base64 --decode
   echo
   ```

   Change the initial password after the first login. If it was already
   changed, use your current credentials rather than the initial secret.

Both port forwards end when their sessions close. No inbound Argo CD port
needs to be opened. Keep the Web UI private: exposing the administrator
interface over this demo's public plain-HTTP ingress would put credentials
and cluster management access at risk. The dashboard displays the
`aggregator-demo` Application with sync/health status once a GitOps release
has been published.

## GitOps workload bootstrap

The `gitops` role creates the Argo CD Application; it does not deploy
containers directly. The Application watches `demo:deploy/k8s-live`, generated after
successful GHCR image builds from `demo`. SSM verifies infrastructure
only; when no published manifests exist, the infrastructure workflow
dispatches `demo-deploy` after Ansible succeeds. The Kubernetes resources
and release procedures are documented in
[deploy/k8s/README.md](../k8s/README.md).
