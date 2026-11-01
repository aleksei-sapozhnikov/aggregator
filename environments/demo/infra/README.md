# Demo infrastructure

OpenTofu in `environments/demo/infra` manages two independent workloads in AWS account
`905418096305` / `eu-central-1`: the serving Docker Compose EC2 with its
Elastic IP, and an optional K3s EC2 with Argo CD. It also manages the
serving demo's SSM deployment document and workload IAM roles/profiles.
The project bucket stores its state at `demo/tofu.tfstate`.

Project IAM policy/role changes belong in [shared administration](../../shared/administration/README.md)
and must be applied as `infra-admin`, separately from this root.

## OpenTofu operations

Use `aggregator-admin` for local inspection (or the approved GitHub
OIDC workflow for deployments):

```sh
cd environments/demo/infra
aws sts get-caller-identity
tofu init -input=false -lockfile=readonly
tofu validate
tofu plan
```

`enable_k3s_node` and `enable_bedrock` default to `false` in the OpenTofu
root. In GitHub, their required values come from `ENABLE_K3S_NODE` and
`ENABLE_BEDROCK` in `demo-infra-plan`. Match those flags when planning
locally; never approve an accidental K3s deletion or a replacement of the
**serving Compose EC2**. K3s uses a separate security group, IAM profile,
public IP and encrypted root volume (50 GiB by default).

The pinned Amazon Linux 2023 cloud-init installs Git and Python; node
configuration runs afterwards from the exact Git revision over AWS SSM.
Ansible configures K3s, bundled Traefik/ServiceLB, Argo CD and its
Application. No SSH or public Kubernetes API access is required.

## Approved automation

[Demo pipeline](../WORKFLOW.md) runs OpenTofu validation and planning before
reviewer approval. It stores the **exact binary plan** privately in
`aggregator-project-tofu-state-905418096305-eu-central-1` under
`plans/demo/<run-id>/<attempt>/demo.tfplan` and verifies its SHA-256
before applying. No binary plan is attached to public GitHub Actions logs.

The plan job checks the last successful Ansible fingerprint in SSM Parameter
Store. The apply job runs Ansible through SSM only when configuration differs
or a reapply is requested; it records success only after health checks pass.
Application images and GitOps manifests are deployed by the separate
`Demo deploy` workflow.

## Inspect and recover

Use an authorized Session Manager connection and inspect the K3s node:

```sh
sudo k3s kubectl get nodes
sudo k3s kubectl get pods -n argocd
sudo k3s kubectl get applications -n argocd
sudo cat /var/lib/aggregator-node/last-configured-revision
sudo tail -100 /var/log/aggregator-node-configure.log
```

SSM output is also in CloudWatch Logs `/aws/ssm/aggregator-demo-k3s`;
cloud-init output is in `/var/log/cloud-init-output.log`.

Do not force-unlock or replace state to recover a partial apply. Create a
fresh plan after investigating the error. Replacing/removing K3s destroys
local-path PVC data (Prometheus/Grafana); image rollback does not.
See [Ansible operations](../ansible/README.md) and [GitOps deployment](../../../deploy/kubernetes/README.md).
