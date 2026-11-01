# Optional K3s EC2 module

OpenTofu module for the separate, single-node K3s demo. It creates an
Amazon Linux 2023 instance, profile, security group and encrypted root
volume. It does not replace or modify the public Compose demo host.

The module is used through the [demo infrastructure root](../../README.md);
the root controls `enable_k3s_node`, AWS permissions and the approved
workflow. Do not apply this module as a standalone Terraform root.

## Provisioning and configuration

Cloud-init installs minimal first-boot prerequisites. The
[demo pipeline](../../../WORKFLOW.md) subsequently uses AWS SSM to
check out the approved source revision and apply
[Ansible configuration](../../../ansible/README.md). K3s, Traefik,
Argo CD and the GitOps Application are managed there, not by cloud-init.
Changes to node configuration can be applied through SSM without replacing
the instance; changing first-boot cloud-init needs deliberate review of
the resulting EC2 replacement.

## Network and operational limits

- Port 80 serves the Kubernetes demo over plain HTTP through Traefik.
  There is no DNS or HTTPS endpoint; do not transmit sensitive data.
- There is no SSH key, inbound SSH port, public Kubernetes API, or public
  Argo CD UI. Use Session Manager and the private SSM dashboard tunnel.
- IMDSv2 is required, and the EC2 role operates under a permission
  boundary. The instance has a **non-static** public IP, not an Elastic IP.
- The default instance is `t3.medium` with a 50 GiB root volume.
  Monitor memory, disk, scheduling failures and OOMKilled pods.

After approved deployment, read the root's `k3s_public_ip` output
and verify Argo CD Synced/Healthy and the app independently. Replacing or
destroying the instance loses K3s local-path monitoring data. See
[K3s release and rollback](../../../../../deploy/kubernetes/README.md).
