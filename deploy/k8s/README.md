# K3s GitOps demo

This is a **separate** deployment of Aggregator. The existing serving
Docker Compose EC2 and its public DNS are not modified.

## Architecture

1. The `demo` branch triggers `.github/workflows/demo-deploy.yml`.
2. Code quality must pass; the workflow builds eight application images and
   publishes each to GHCR with an immutable 40-character Git commit tag.
3. The `publish-k3s-release` job snapshots `deploy/k8s` from that exact
   source commit, validates it with `kubectl kustomize`, pins all eight image
   tags to the same commit, and pushes the result to the `k3s-demo` branch.
4. Ansible's `gitops` role creates Argo CD Application `aggregator-demo`,
   watching `k3s-demo:deploy/k8s`. Automatic sync and self-healing reconcile
   manifests; Kubernetes pulls images from GHCR.
5. K3s ships with Traefik and ServiceLB enabled. A hostless HTTP Ingress
   routes port 80 to `aggregator-ui:3000`, whose bundled Caddy forwards the
   catalog, Product Health API, AI chat, Prometheus and Grafana paths.

Application components: aggregator, catalog, aggregator-ui, ai-agent,
chaos-maker, three dummy services, Prometheus and Grafana. Grafana provisioning
includes the demo timeline dashboard. Prometheus and Grafana use K3s
local-path PVCs; they are **not** durable across EC2 deletion/recreation.

## First deployment

- Review and apply `deploy/infra/admin` policy changes with the designated
  infra-admin identity. Do not manually alter IAM.
- Verify all eight GHCR packages permit **anonymous pull**, as no image pull
  secret is deployed on the K3s instance.
- Merge the changes from `dev` into `demo` and push. Wait for
  `publish-k3s-release` to succeed so the `k3s-demo` branch exists and
  contains images from the actual published SHA.
- Set `DEMO_INFRA_WORKFLOW_ENABLED=true`, `ENABLE_K3S_NODE=true` and
  `ENABLE_BEDROCK` according to the existing workflow instructions.
  Supply `K3S_BOOTSTRAP_GIT_REF` as a **full commit SHA on demo** containing
  these Ansible changes.
- Review the `demo-infra-plan` job and approve the
  `demo-infra-apply` environment only after examining the exact plan.
- After a successful job, read OpenTofu output `k3s_public_ip` and open
  `http://<k3s_public_ip>/`. The node has an ephemeral public IPv4.
  Do **not** use the existing `aggregator.alivion.cc` hostname to test it.

The infrastructure workflow fails if the newly created instance does not
finish cloud-init and Ansible, or if K3s, Traefik, Argo CD and its Aggregator
Application are not healthy. It also verifies the local HTTP entrypoint.
SSM command output is retained in CloudWatch Logs.

The GitOps release branch is produced by GitHub Actions with
`contents: write` on the publication job only. If repository/organization
settings forbid `GITHUB_TOKEN` pushes, or `k3s-demo` is protected against
automation, the release job will fail and no new version will be promoted.
Do not weaken `demo-infra-apply` approval rules to resolve that.

## Subsequent updates

Every successful `demo` image build promotes one immutable release
commit to `k3s-demo`. Argo CD observes this branch and reconciles the K3s
workloads. No direct SSH, manual container pull or re-running Ansible is
required for ordinary code changes.

The `deploy` job in `demo-deploy.yml` still deploys the **separate**
Docker Compose demo using AWS SSM. K3s promotion does not replace it.

A rollback is a reviewed revert of the GitOps release commit on
`k3s-demo`, restoring its previous manifests and image SHA. Argo CD then
reconciles the previous release. K3s local-path PVC data is not rolled back
with an image rollback.

## Operational and security limitations

- The IP-only ingress is **plain HTTP**, not HTTPS. Port 443 is not opened;
  neither TLS certificates nor DNS are configured. Do not send secrets or
  sensitive user data through this public demo endpoint.
- Argo CD, SSH and the Kubernetes API are not publicly exposed. The demo UI
  intentionally exposes its Grafana/Prometheus read-only-oriented paths via
  its Caddy proxy; review this before using a real environment.
- The Grafana init container reads the EC2 public IPv4 through IMDSv2 to
  generate a correctly scoped `/grafana/` URL. This depends on the
  Terraform-configured hop limit. Pods on this demo node may also reach
  instance-profile credentials through IMDS; use workload identities and
  network controls before considering this production-ready.
- The default K3s instance type is `t3.large` (8 GiB) rather than
  `t3.medium`, to fit the complete single-node stack. Review costs.
- Image builds, an existing published GitOps branch, outbound GHCR/GitHub
  access and correct application container health are prerequisites.
  No successful deployment of these manifests to AWS has been performed yet.

## Diagnostics

Use the SSM command ID shown in GitHub Actions and its CloudWatch Logs group
`/aws/ssm/aggregator-demo-k3s`. On the instance via SSM Session Manager:

```sh
sudo k3s kubectl get applications -n argocd
sudo k3s kubectl get pods,svc,ingress -n aggregator
sudo k3s kubectl get pods -n kube-system -l app.kubernetes.io/name=traefik
curl -i http://127.0.0.1/config.json
```
