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

## GitOps workload bootstrap

The `gitops` role creates the Argo CD Application; it does not deploy
containers directly. The Application watches `demo:deploy/k8s-live`, generated after
successful GHCR image builds from `demo`. SSM verifies infrastructure
only; when no published manifests exist, the infrastructure workflow
dispatches `demo-deploy` after Ansible succeeds. The Kubernetes resources
and release procedures are documented in
[deploy/k8s/README.md](../k8s/README.md).
