# Demo infrastructure

See [the demo infrastructure GitHub Actions workflow](WORKFLOW.md) for
dev validation, demo-only plan/apply, OIDC, manual approval, and SSM setup.

The [Aggregator project IAM bootstrap](../bootstrap/README.md) owns IAM
users, groups, OIDC roles and reusable policies. This root consumes those
permissions and manages only demo infrastructure. IAM roles and instance
profiles attached to the demo EC2 nodes remain here because they belong to
those workloads. Apply `infra/bootstrap` first, then `infra/demo`.

This OpenTofu root manages the protected serving EC2 demo (including its
Elastic IP) and an **optional, separate K3s EC2 node**. The serving instance
remains untouched by the new bootstrap; application deployment and traffic
cutover are separate future steps. The shared state key is `demo/tofu.tfstate`
in AWS account `905418096305`, region `eu-central-1`.

## Provisioning

Use OpenTofu 1.12+, the existing state backend, and the delegated
`aggregator-admin` AWS credentials:

```sh
export AWS_PROFILE=aggregator-admin
tofu init
tofu validate
tofu plan
```

By default `enable_k3s_node = false` to avoid unexpected EC2 charges.
To provision the K3s node, set `enable_k3s_node = true` and review the
full OpenTofu plan using the same values as the GitHub demo Environment.
Keep `enable_bedrock` consistent with the running legacy instance.
Do not apply plans that unexpectedly remove or replace existing instances.

The exact Ansible revision is provided later by the GitHub workflow through
SSM as a Git commit SHA; it is not an OpenTofu variable.
The node uses the selected default public subnet, its own IAM profile and
security group, a 50 GiB encrypted root volume by default, and an automatically
assigned public IP. It does not take the serving demo's Elastic IP.

The selected pinned AL2023 AMI must remain available in `eu-central-1`.
First-boot cloud-init installs Python 3.12 and Git and provides a
legacy compatibility wrapper. After an approved infrastructure apply, SSM
fetches the exact Git revision and invokes the version-owned
`infra/demo/node-configure.sh`, which runs Ansible to configure K3s and
Argo CD; egress to AWS Systems Manager, GitHub, PyPI, K3s releases,
and container registries must work. K3s has Traefik and ServiceLB disabled
until a separately configured ingress solution is added.

## Reapply and inspect with SSM

The new instance role has `AmazonSSMManagedInstanceCore`. Administrators
with the existing `AggregatorDemoSessionAccess` policy can start Session
Manager sessions; Run As is managed by `aws_foundation/account`.
There is no inbound TCP/22 or Kubernetes API access.

```sh
aws ssm start-session \
  --region eu-central-1 \
  --target "$(tofu output -raw k3s_instance_id)"
```

For normal configuration, use the approved GitHub demo workflow. Its
SSM command serializes Git checkout and Ansible execution using the same lock
as the old EC2 wrapper. Inside an SSM session, inspect the result:

```sh
sudo /usr/local/bin/k3s kubectl get nodes
sudo /usr/local/bin/k3s kubectl get pods -n argocd
sudo cat /var/lib/aggregator-node/last-configured-revision
sudo tail -100 /var/log/aggregator-node-configure.log
```

The versioned scripts are `infra/demo/ssm-node-configure.sh` (SSM command)
and `infra/demo/node-configure.sh` (Ansible runner). The old on-node wrapper
is kept only for compatibility and rollback.
First-boot logs are also in `/var/log/cloud-init-output.log`.
Updating Terraform user data on an existing instance does **not**
reinvoke the playbook; use SSM for subsequent reconciliation. A separate
`infra/demo/ansible/README.md` describes role behavior and checks.

Argo CD is initially a **ClusterIP-only** service. Its UI is not publicly
exposed and no Aggregator application manifests are installed.

## Checks and safeguards

Static checks for the Terraform root, when OpenTofu/TFLint are installed:

```sh
tofu fmt -check -recursive
tofu validate
tflint --init
tflint --recursive --config="$PWD/.tflint.hcl" --minimum-failure-severity=notice
```

Review every plan that might affect the currently serving legacy instance.
It remains protected by `prevent_destroy`. Turning off the K3s flag after
enabling it would plan removal of the **new** node; preserve its data first.
Keep state, saved plans, credentials and local variables out of Git.
The separate `enable_bedrock` switch for the existing serving EC2
still defaults to `false`.
