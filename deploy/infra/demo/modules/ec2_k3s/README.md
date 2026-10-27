# EC2 node for K3s

This opt-in Terraform module creates a separate Amazon Linux 2023 EC2 node,
instance profile, and security group. Cloud-init runs during **first boot**:
it installs the Ansible control environment and applies
[deploy/ansible](../../../../ansible/README.md) to install K3s and Argo CD.

Security and networking:

- IMDSv2 is required, the gp3 root volume is encrypted, and the IAM role
  grants SSM and Bedrock access within its permissions boundary.
- Only inbound HTTP/HTTPS (80/443) is configured for future applications.
  There is no SSH key pair, port 22, public Kubernetes API port, or public
  Argo CD endpoint.
- The instance gets an ephemeral public IPv4 address, **not** an Elastic IP.
  It may change after a stop/start; the existing demo IP is not changed.
- Session Manager provides interactive access as `ec2-user`, with sudo
  for node configuration.

`bootstrap_git_ref` must be `dev` or a full lowercase Git commit SHA. It
defaults to `dev` for development. Prefer a reviewed immutable SHA: the
bootstrapped repository playbook is executed as root.

Cloud-init does not run automatically again when user data changes on an
existing node. Reapply with the wrapper over SSM, as documented in the
[demo root](../../README.md).

The K3s and Argo CD versions are pinned inside the Ansible configuration.
Changing them is a deliberate upgrade, not a Terraform replacement. No
Kubernetes workloads or ingress controller are deployed at this stage.
