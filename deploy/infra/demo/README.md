# Demo infrastructure

See [the demo infrastructure GitHub Actions workflow](WORKFLOW.md) for
dev validation, demo-only plan/apply, OIDC, manual approval, and SSM setup.

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
To provision the K3s node, review a plan with the new node explicitly
enabled. Pin the checked-in Ansible configuration to a known commit:

```sh
tofu plan \
  -var='enable_k3s_node=true' \
  -var="k3s_bootstrap_git_ref=$(git rev-parse dev)"
```

Apply only after reviewing a plan with the **same variables and revision**.
The node uses the selected default public subnet, its own IAM profile and
security group, a 50 GiB encrypted root volume by default, and an automatically
assigned public IP. It does not take the serving demo's Elastic IP.

The selected pinned AL2023 AMI must remain available in `eu-central-1`.
First-boot cloud-init installs Python 3.12 and Git and fetches the
specified repository revision. Local Ansible roles install base packages,
K3s, then Argo CD; egress to AWS Systems Manager, GitHub, PyPI, K3s releases,
and container registries must work. K3s has Traefik and ServiceLB disabled
until a separately configured ingress solution is added.

## Reapply and inspect with SSM

The new instance role has `AmazonSSMManagedInstanceCore`. Administrators
with the existing `AggregatorDemoSessionAccess` policy can start Session
Manager sessions; Run As must be enabled in the admin root preferences.
There is no inbound TCP/22 or Kubernetes API access.

```sh
aws ssm start-session \
  --region eu-central-1 \
  --target "$(tofu output -raw k3s_instance_id)"
```

Within that SSM session, run the desired reviewed Git commit directly:

```sh
sudo /usr/local/sbin/aggregator-node-configure <40-character-git-commit-sha>
sudo /usr/local/bin/k3s kubectl get nodes
sudo /usr/local/bin/k3s kubectl get pods -n argocd
sudo cat /var/lib/aggregator-node/last-configured-revision
```

The script uses a lock to prevent concurrent runs, reports failures,
and writes `/var/log/aggregator-node-configure.log`.
First-boot logs are also in `/var/log/cloud-init-output.log`.
Updating Terraform user data on an existing instance does **not**
reinvoke the playbook; use SSM for subsequent reconciliation. A separate
`deploy/ansible/README.md` describes role behavior and checks.

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
