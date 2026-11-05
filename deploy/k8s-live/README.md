# Public K3s GitOps demo

K3s serves [aggregator.alivion.cc](https://aggregator.alivion.cc)
through a protected public Elastic IP. It runs the Aggregator stack,
Prometheus/Grafana and sample services, with Traefik routing HTTP/HTTPS
and renewing Let's Encrypt certificates. This is an **unhardened public
demo**, not a production Kubernetes configuration.

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

Confirm the Demo deploy workflow succeeded, Argo CD reports
`aggregator-demo` as Synced/Healthy, and the public endpoint responds
with a **trusted** HTTPS certificate:

```sh
curl -I http://aggregator.alivion.cc/
curl -I https://aggregator.alivion.cc/
curl -I https://www.alivion.cc/
curl -I https://alivion.cc/
```

HTTP should redirect to HTTPS, and the apex domain should redirect to
`https://aggregator.alivion.cc/`. Confirm the UI, APIs, AI agent and
Grafana timeline work. Do not bypass TLS validation in routine checks.
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

## Deployment rollouts

The GitHub Actions workflow builds and publishes container images before
publishing the GitOps manifests. Argo CD then reconciles the Deployment updates.

Catalog, Aggregator, UI, and AI agent use a one-at-a-time `RollingUpdate`
with `maxSurge: 1`, `maxUnavailable: 0`, and a five-second minimum
readiness window. Their old Pod stays available while the replacement
starts and passes its HTTP readiness probe. The Aggregator exposes a
Spring Boot readiness endpoint at `/actuator/health/readiness`; the
other three use their existing health/configuration endpoints.

The dummy services, chaos-maker, Prometheus, and Grafana retain `Recreate`:
dummy state and chaos scheduling are held in memory, and the monitoring
services use single-writer local-path PVC data. This is not a
whole-stack zero-downtime deployment. Updates to multiple services can
briefly mix application versions, and existing HTTP requests may still be
interrupted during shutdown. K3s runs on one EC2 node, so there must
be enough free memory to run the old and new Pod together. If not, the
rollout waits without intentionally killing the existing ready Pod.

To verify a rollout through an authorized SSM session:

```sh
sudo k3s kubectl -n aggregator rollout status deployment/aggregator --timeout=300s
sudo k3s kubectl -n aggregator rollout status deployment/aggregator-ui --timeout=300s
sudo k3s kubectl -n aggregator get deploy,pods
```

Check that the desired deployments have `1/1` available after the release
and that Argo CD is Synced/Healthy. A failed readiness check prevents the
new Pod from being counted as available; inspect rollout events and logs.

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
