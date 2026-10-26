# Serving EC2 environment

Creates an EC2 instance, workload role and profile, security group rules, and an
Elastic IP. Destruction is protected for resources serving the demo.

The caller supplies the VPC, subnet, AMI, instance settings, and optional managed
policy ARNs. Use `volume_tags` at creation or `root_volume_tags` for an existing
root volume. Outputs expose compute, network, and IAM identifiers.

`main.tf` declares resources, `variables.tf` describes inputs, `outputs.tf`
exposes identifiers, and `versions.tf` declares the AWS provider requirement.
