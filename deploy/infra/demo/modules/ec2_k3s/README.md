# EC2 environment for k3s

Creates a separate Amazon Linux 2023 EC2 node, role and profile, security group,
and Elastic IP. It attaches SSM and Bedrock policies; it does not install k3s.
The demo root does not enable this module.

The caller supplies the AMI, VPC, and public subnet. The module does not
configure an SSH key pair or expose TCP/22. Interactive administration uses
Session Manager as `ec2-user` on Amazon Linux 2023. The IAM
`AggregatorDemoSessionAccess` policy authorizes the tagged
`aggregator-demo-k3s` node. The referenced demo permissions boundary and
Bedrock policy must exist in AWS.

`main.tf` declares resources, `variables.tf` describes inputs, `outputs.tf`
exposes identifiers, and `versions.tf` declares the AWS provider requirement.
