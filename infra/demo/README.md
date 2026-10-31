# Demo infrastructure

See [the demo infrastructure GitHub Actions workflow](WORKFLOW.md) for
dev validation, demo-only plan/apply, OIDC, manual approval, and SSM setup.

The [Aggregator project IAM administration](../administration/README.md) owns IAM
users, groups, OIDC roles and reusable policies. This root consumes those
permissions and manages only demo infrastructure. IAM roles and instance
profiles attached to the demo EC2 nodes remain here because they belong to
those workloads. Apply `infra/administration` first, then `infra/demo`.

This OpenTofu root manages the protected serving EC2 demo (including its
Elastic IP) and an **optional, separate K3s EC2 node**. The serving instance
remains untouched by the new bootstrap; application deployment and traffic
cutover are separate future steps. The project-owned state key is `demo/tofu.tfstate`
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
A reviewed replacement of only `module.aggregator_demo_k3s[0].aws_instance.this`
is expected when adopting the minimal cloud-init. Never replace the serving
`module.aggregator_demo` EC2 instance.

The exact Ansible revision is provided later by the GitHub workflow through
SSM as a Git commit SHA; it is not an OpenTofu variable.
The node uses the selected default public subnet, its own IAM profile and
security group, a 50 GiB encrypted root volume by default, and an automatically
assigned public IP. It does not take the serving demo's Elastic IP.

The selected pinned AL2023 AMI must remain available in `eu-central-1`.
First-boot cloud-init only installs Python 3.12 and Git. It contains no
repository paths, shell wrapper or Ansible execution. After an approved
infrastructure apply, SSM fetches the exact Git revision and invokes
`infra/demo/node-configure.sh` to configure K3s and Argo CD. Egress to
AWS Systems Manager, GitHub, PyPI, K3s releases and container registries
must work. K3s uses its bundled Traefik and ServiceLB.

## Private saved plans

The approved demo workflow stores binary OpenTofu plans in the private,
versioned Aggregator state bucket (`aggregator-project-tofu-state-905418096305-eu-central-1`) under
`plans/demo/<run-id>/<attempt>/demo.tfplan`.
The `plan` job conditionally uploads with `If-None-Match: *`, then
passes the SHA-256 through a GitHub job output. After Environment approval,
the `apply` job downloads the plan and verifies its checksum before running
`tofu apply`. No binary plan is uploaded as a GitHub Actions artifact.

S3 Lifecycle expires these temporary files after seven days (with
noncurrent-version cleanup). The project bucket and Lifecycle are owned
by `infra/state`, executed with `aggregator-admin`; role permissions
are managed in `infra/administration` by the central AWS administrator.
Complete [state migration](../MIGRATE-STATE.md) before promoting the
new workflow to `demo`. State and lock objects are outside the expiry prefix.

## Reapply and inspect with SSM

The new instance role has `AmazonSSMManagedInstanceCore`. Administrators
with the existing `AggregatorDemoSessionAccess` policy can start Session
Manager sessions; Run As is managed by `aws_foundation/aws_account`.
There is no inbound TCP/22 or Kubernetes API access.

```sh
aws ssm start-session \
  --region eu-central-1 \
  --target "$(tofu output -raw k3s_instance_id)"
```

For normal configuration, use the approved GitHub demo workflow. Its
SSM command serializes Git checkout and Ansible execution using a lock.
Inside an SSM session, inspect the result:

```sh
sudo /usr/local/bin/k3s kubectl get nodes
sudo /usr/local/bin/k3s kubectl get pods -n argocd
sudo cat /var/lib/aggregator-node/last-configured-revision
sudo tail -100 /var/log/aggregator-node-configure.log
```

The versioned scripts are `infra/demo/ssm-node-configure.sh` (SSM command)
and `infra/demo/node-configure.sh` (Ansible runner). No persistent
configuration wrapper is installed by the new EC2 cloud-init.
First-boot logs are also in `/var/log/cloud-init-output.log`.
Updating Terraform user data on an existing instance does **not**
reinvoke the playbook; use SSM for subsequent reconciliation. A separate
`infra/demo/ansible/README.md` describes role behavior and checks.

Argo CD is a **ClusterIP-only** service. Its UI is not publicly
exposed; application manifests are published separately by the demo workflow.

## Checks and safeguards

Static checks for the Terraform root, when OpenTofu/TFLint are installed:

```sh
tofu fmt -check -recursive
tofu validate
tflint --init
tflint --recursive --config="$PWD/.tflint.hcl" --minimum-failure-severity=notice
```

Review every plan that might affect the currently serving legacy instance.
Replacing the K3s EC2 discards its local-path PVC data (Prometheus and Grafana).
This is intentional for the rebuild, not a data migration.
It remains protected by `prevent_destroy`. Turning off the K3s flag after
enabling it would plan removal of the **new** node; preserve its data first.
Keep state, saved plans, credentials and local variables out of Git.
The separate `enable_bedrock` switch for the existing serving EC2
still defaults to `false`.
