# EC2 node for K3s

This opt-in Terraform module creates a separate Amazon Linux 2023 EC2 node,
instance profile, and security group. Cloud-init runs during **first boot**
to install only minimal prerequisites. After Terraform
apply, GitHub Actions uses the versioned `environments/demo/src/sh/ssm-node-configure.sh`
over SSM to fetch the approved commit and run its `environments/demo/src/sh/node-configure.sh`
entrypoint with [Ansible](../../ansible/README.md). There is no on-node wrapper in the new cloud-init; all configuration
logic is maintained in Git and invoked over SSM.

Security and networking:

- IMDSv2 is required, the gp3 root volume is encrypted, and the IAM role
  grants SSM and Bedrock access within its permissions boundary.
- Inbound HTTP (80) serves the demo through K3s Traefik and ServiceLB.
  There is no SSH key pair, port 22, public Kubernetes API port, or public
  Argo CD endpoint.
- The instance gets an ephemeral public IPv4 address, **not** an Elastic IP.
  It may change after a stop/start; the existing demo IP is not changed.
- Session Manager provides interactive access as `ec2-user`, with sudo
  for node configuration.

There is no bootstrap Git variable: the SSM command receives the exact
GitHub workflow commit SHA. The cloud-init template does not depend on
application or Ansible revisions. A cloud-init template change is a
reviewed EC2 replacement so first-boot initialization is applied reliably.
Subsequent Ansible changes run on the existing node through SSM.

The K3s and Argo CD versions are pinned inside the Ansible configuration.
Changing them is a deliberate upgrade, not a Terraform replacement.
The default K3s Traefik/ServiceLB serves the application on the instance public
IP over plain HTTP. No DNS or TLS certificate is provisioned, and 443 should
remain closed until HTTPS is explicitly configured. The default K3s instance
is t3.medium for an initial cost-conscious trial. Monitor memory pressure
and OOMKilled pods; a larger size may still be required.

The public HTTP address is available from OpenTofu output `k3s_public_ip`
after a successful reviewed deployment. The full release pipeline and
security limitations are described in [the K3s deployment README](../../../../deploy/kubernetes/README.md).
