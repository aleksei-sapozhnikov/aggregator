# K3s GitOps demo

The K3s instance is separate from the public Docker Compose demo and
does not use its Elastic IP or DNS. It runs the Aggregator stack,
Prometheus/Grafana and demo services, with Traefik/ServiceLB on HTTP
port 80. The default workload is an **unhardened public demo**, not a
production Kubernetes configuration.

## Release flow

1. A `deploy/demo` push starts [Demo pipeline](../../infra/demo/WORKFLOW.md).
   It plans infrastructure, checks the Ansible fingerprint, and requires
   reviewer approval only when infrastructure or node configuration changes.
2. Once ready, `Demo deploy` runs QA, checks GHCR for eight content-tagged
   Docker images and builds only missing images.
3. The release job renders `deploy/k8s` manifests and monitoring files into
   `deploy/k8s-live` **on the protected `deploy/demo-gitops` branch**.
   It replaces image references with each service's Git tree ID.
4. Argo CD's `aggregator-demo` Application follows
   `deploy/demo-gitops:deploy/k8s-live`, auto-syncs and self-heals.

Edit the source `deploy/k8s` manifests, **not** the generated
`deploy/k8s-live` snapshot. GitOps publication must be fast-forward;
do not force-push or delete the GitOps branch. Rewriting the source
branch must not erase the published configuration.

## Check a release

Verify the `Demo deploy` workflow succeeded, then inspect Argo CD
(Synced/Healthy) and the service at `http://<k3s-public-ip>/`.
No DNS or HTTPS endpoint is configured for this K3s instance.
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
tunnel, see [Ansible](../../infra/demo/ansible/README.md).

## Rollback and limits

To roll back the application, **revert the published release commit**
in `deploy/demo-gitops` (a new fast-forward commit). Argo CD then syncs
the preceding manifest state. This does not require rebuilding images
or re-running Ansible.

- Traffic is plain HTTP by IP. Do not send confidential data to this demo.
  Port 443, SSH, Kubernetes API and Argo CD UI are not publicly exposed.
- Prometheus and Grafana use K3s local-path PVCs. Destroying/replacing
  the EC2 loses their data; an application image rollback does not.
- Prometheus retention is limited to 30 days or 5 GB; its PVC requests
  8 GiB. The default instance is `t3.medium` (4 GiB) with a 50 GiB
  root volume, so watch OOMKills, disk and scheduling.
- Grafana's public-IP helper uses EC2 IMDSv2. Public monitoring routes
  and instance-profile access would need further hardening for production.
- K3s pulls GHCR images anonymously. Required packages must be public
  and the instance must reach GHCR and relevant external registries.
