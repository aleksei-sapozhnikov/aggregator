# K3s GitOps demo

The K3s instance is separate from the public Docker Compose demo and
initially uses its own public IP until the explicit Elastic IP cutover.
It runs the Aggregator stack, Prometheus/Grafana and demo services.
Traefik/ServiceLB serves HTTP (redirecting to HTTPS) and HTTPS on
ports 80 and 443, with automatic Let's Encrypt certificate renewal. The default workload is an **unhardened public demo**, not a
production Kubernetes configuration.

## Release flow

1. A `deploy/demo` push starts [Demo pipeline](../../environments/demo/WORKFLOW.md).
   It plans infrastructure, checks the Ansible fingerprint, and requires
   reviewer approval only when infrastructure or node configuration changes.
2. Once ready, `Demo deploy` runs QA, checks GHCR for eight content-tagged
   Docker images and builds only missing images.
3. The release job renders `deploy/kubernetes` manifests and monitoring files into
   `deploy/k8s-live` **on the protected `deploy/demo-gitops` branch**.
   It replaces image references with each service's Git tree ID.
4. Argo CD's `aggregator-demo` Application follows
   `deploy/demo-gitops:deploy/k8s-live`, auto-syncs and self-heals.

The monitoring JSON/YAML sources are owned by `services/grafana` and
`services/prometheus`, not duplicated here. The release pipeline stages them
into the Kustomize directory before building ConfigMaps. To render locally:

```sh
bash environments/demo/src/sh/stage-kubernetes.sh /tmp/aggregator-k8s
kubectl kustomize /tmp/aggregator-k8s
```

The staging destination must not already exist. Edit the source
`deploy/kubernetes` manifests, **not** the generated
`deploy/k8s-live` snapshot. GitOps publication must be fast-forward;
do not force-push or delete the GitOps branch. Rewriting the source
branch must not erase the published configuration.

## Check a release

Verify the `Demo deploy` workflow succeeded and Argo CD is
Synced/Healthy. Before switching the Elastic IP, test the new node directly
without changing public DNS:

```sh
curl -kI --resolve aggregator.alivion.cc:443:<k3s-public-ip> https://aggregator.alivion.cc/
curl -kI --resolve www.alivion.cc:443:<k3s-public-ip> https://www.alivion.cc/
curl -kI --resolve alivion.cc:443:<k3s-public-ip> https://alivion.cc/
```

The first two requests must reach the application; the apex host must redirect
to `https://aggregator.alivion.cc/`. The `-k` flag is **only** for the
pre-cutover test: DNS still points at the old Compose/Caddy instance, so
Let's Encrypt HTTP-01 cannot validate the new Traefik instance yet.
Do not accept an untrusted certificate after cutover.

After the explicit, reviewed EIP switch, confirm that Traefik obtained
trusted certificates for all three hostnames, HTTP redirects to HTTPS, and
the UI, APIs, Grafana timeline, and agent work at the public domain.
Ansible startup checks alone do not verify application workloads.

For troubleshooting through an authorized SSM session:

```sh
sudo k3s kubectl get applications -n argocd
sudo k3s kubectl get pods,svc,ingress -n aggregator
sudo k3s kubectl top nodes
sudo k3s kubectl top pods -n aggregator
curl -i http://127.0.0.1/config.json
```

Metrics Server must be ready for `kubectl top`. The relevant SSM log group
is `/aws/ssm/aggregator-demo-k3s`. For a private Argo CD dashboard
tunnel, see [Ansible](../../environments/demo/ansible/README.md).

## Rollback and limits

To roll back the application, **revert the published release commit**
in `deploy/demo-gitops` (a new fast-forward commit). Argo CD then syncs
the preceding manifest state. This does not require rebuilding images
or re-running Ansible.

- Ports 80 and 443 are public. HTTP redirects to HTTPS, and ACME HTTP-01
  needs port 80. SSH, Kubernetes API and Argo CD UI remain private.
- The certificate and ACME account are stored in Traefik's local-path PVC.
  Deleting or replacing the EC2 node loses them; renewals are automatic
  as long as DNS points to the node and ports 80/443 remain reachable.
- Prometheus and Grafana use K3s local-path PVCs. Destroying/replacing
  the EC2 loses their data; an application image rollback does not.
- Prometheus retention is limited to 30 days or 5 GB; its PVC requests
  8 GiB. The default instance is `t3.medium` (4 GiB) with a 50 GiB
  root volume, so watch OOMKills, disk and scheduling.
- Grafana uses the public HTTPS origin under `/grafana/`, avoiding mixed
  content in embedded timelines. Public monitoring routes and
  instance-profile access would need further hardening for production.
- K3s pulls GHCR images anonymously. Required packages must be public
  and the instance must reach GHCR and relevant external registries.
