# Aggregator demo infrastructure (OpenTofu)

This directory contains two deliberately distinct EC2 modules.

| Module | Intended use |
| --- | --- |
| `modules/ec2_legacy/` | The existing imported Docker Compose demo instance. Preserves current behavior and imported-resource exceptions. |
| `modules/ec2_k3s/` | A new instance only. Uses strict creation-time tagging, encryption, dedicated IAM, and fixed ingress rules. |

## Preserving existing state

The existing root module remains named `module.aggregator_demo`, and the Terraform resource names inside `ec2_legacy` are unchanged. Only its `source` path changed. **Do not rename the existing root module**, change its state address, import it again, or run `tofu state mv` for this refactor.

From `deploy/infra`, using the **same existing state**:

```sh
tofu init
tofu validate
tofu plan
```

Before enabling the new instance, verify that the plan reports `No changes` for the existing resources. Do not apply if replacements or tag removals are planned.

## New instance contract

`ec2_k3s` intentionally has no imported-resource overrides or optional unsafe settings:

- Resource names are fixed for the new `aggregator-demo-k3s` node.
- `Project=aggregator`, `Environment=demo`, `ManagedBy=terraform`, and `Component=k3s` are always set on taggable resources. The EBS root volume receives these tags **during instance creation**.
- Only a verified, Amazon-owned Amazon Linux 2023 x86_64 AMI is accepted. Pin its ID at the call site.
- Root disk is always encrypted gp3, 40–200 GiB, deleted when the instance is terminated.
- IMDSv2 is always required, with metadata hop limit 2 for container workloads.
- New IAM role/profile are independent. The role has the existing `AggregatorDemoRoleBoundary` and attaches the existing `AggregatorCallBedrockModel` and AWS-managed `AmazonSSMManagedInstanceCore` policies.
- Inbound 80/443 are public. SSH is disabled by default; enabling it requires an existing EC2 key pair and a single `/32` administrator address. Port 6443 is not public.
- Outbound IPv4 access is allowed for AWS APIs and container images.
- The VPC and public subnet are shared network dependencies, not owned or deleted by this module.
- EC2 is initially empty. Ansible/k3s setup is **not** performed by OpenTofu.

## Enable the new instance later

After provisioning permissions are ready, select a verified Amazon Linux 2023 x86_64 AMI in `eu-central-1` and add the following root module to `main.tf` (this is **not enabled** in the delivered code):

```hcl
module "aggregator_demo_k3s" {
  source        = "./modules/ec2_k3s"
  ami_id        = "ami-REPLACE_WITH_VERIFIED_AL2023_AMI_ID"
  instance_type = "t3.large"
  vpc_id        = data.aws_vpc.default.id
  subnet_id     = data.aws_subnet.default["aggregator_demo"].id
}
```

For SSH-based Ansible configuration, explicitly add an existing key pair name and a single trusted `/32` source:

```hcl
  ssh_key_name  = "YOUR_K3S_KEY_PAIR_NAME"
  admin_ssh_cidr = "YOUR_PUBLIC_IP/32"
```

Alternatively, keep SSH closed and use a documented AWS Systems Manager transport workflow for Ansible. Ensure the AMI/instance has SSM Agent enabled and SSM network connectivity before relying on this access path.

**Do not run `tofu apply` until the IAM management policy, EC2 permissions, AMI selection, and access method have been validated.**
