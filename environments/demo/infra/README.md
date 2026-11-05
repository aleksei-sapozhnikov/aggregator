# Public demo infrastructure

The OpenTofu root in `environments/demo/infra` manages the K3s EC2,
its IAM role/profile, security group, SSM logs and the **existing protected
public Elastic IP**. State remains at `demo/tofu.tfstate` in the project
state bucket in AWS account `905418096305`, region `eu-central-1`.

Project-wide IAM roles and permissions are managed separately by
[administration](../../shared/infra/administration/README.md) and applied
with `infra-admin`. The approved
[Demo pipeline](../WORKFLOW.md) is responsible for workload changes.

## OpenTofu operations

To inspect the current infrastructure with `aggregator-admin`:

```sh
cd environments/demo/infra
aws sts get-caller-identity
tofu init -input=false -lockfile=readonly
tofu validate
tofu plan
```

The public K3s instance is always provisioned. Changes must not delete
or replace its EC2 or the Elastic IP: these serve the live HTTPS
[demo](https://aggregator.alivion.cc). Do not use `tofu state rm`, force-unlock, or manual
`aws ec2 associate-address` to bypass the approved plan.

The node runs a pinned Amazon Linux 2023 AMI with an encrypted root volume
and only ports 80 and 443 public. Ansible installs K3s, Traefik, Argo CD
and the GitOps Application over SSM. The Kubernetes API and Argo CD UI
remain private.

## Approved apply

`demo-infra.yml` creates a read-only plan and stores its exact binary
form privately under `plans/demo/<run-id>/<attempt>/demo.tfplan`.
The protected apply job verifies its SHA-256 digest before applying.
Inspect any deletion or replacement in the full plan; do not approve
unexpected changes to K3s, EIP, state, or other AWS resources.

A partially completed apply requires a new plan from current AWS state.
If the IAM policy is missing permissions, fix it through the separate
administration root first, then replan demo. Never reuse a failed plan.

## Inspect and recover

In an authorized SSM session:

```sh
sudo k3s kubectl get nodes
sudo k3s kubectl get pods -n argocd
sudo k3s kubectl get applications -n argocd
sudo k3s kubectl get pods,svc,ingress -n aggregator
sudo tail -100 /var/log/aggregator-node-configure.log
```

SSM output also appears in CloudWatch
`/aws/ssm/aggregator-demo-k3s`. K3s local-path PVC data (Grafana,
Prometheus and Traefik ACME storage) is lost if the instance and its
root volume are destroyed. Application rollbacks use the protected
GitOps branch rather than replacing EC2.

See [Ansible operations](../ansible/README.md) and
[GitOps deployment](../../../deploy/kubernetes/README.md).
