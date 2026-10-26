# EC2 environment for k3s

Creates a separate Amazon Linux 2023 EC2 node, role and profile, security group,
and Elastic IP. It attaches SSM and Bedrock policies; it does not install k3s.
The demo root does not enable this module.

The caller supplies the AMI, VPC, and public subnet. SSH is disabled by default;
enabling it requires a key pair and one administrator IPv4 `/32` address.
The referenced demo permissions boundary and Bedrock policy must exist in AWS.

`main.tf` declares resources, `variables.tf` describes inputs, `outputs.tf`
exposes identifiers, and `versions.tf` declares the AWS provider requirement.
