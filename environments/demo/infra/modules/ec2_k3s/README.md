# K3s EC2 module

This OpenTofu module configures the public demo's single K3s node on
Amazon Linux 2023. It creates the instance, IAM role/profile, security
group, CloudWatch SSM log group and encrypted root volume. The
[demo infrastructure root](../../README.md) owns the protected
Elastic IP and the GitOps deployment workflow.

Do not apply this module standalone or change its instance identity
outside the reviewed OpenTofu plan. The public demo uses only K3s.

## Provisioning

Cloud-init installs first-boot prerequisites. The
[Demo pipeline](../../../WORKFLOW.md) then uses AWS SSM to check out
the approved revision and apply
[Ansible configuration](../../../ansible/README.md). K3s, Traefik
with Let's Encrypt HTTPS, Argo CD, and the GitOps Application are
managed by Ansible.

Node configuration can be reapplied through SSM. Modifying first-boot
cloud-init may require EC2 replacement and must be reviewed against
K3s local-path persistent data.

## Network and operational limits

- The public Elastic IP serves
  [aggregator.alivion.cc](https://aggregator.alivion.cc) on ports 80/443
  through Traefik. HTTP redirects to HTTPS.
- No inbound SSH, public Kubernetes API or public Argo CD UI is exposed.
  Use Session Manager and the [private dashboard](../../../README.md).
- IMDSv2 is required; the EC2 role has a permissions boundary.
- The default instance is `t3.medium` with a 50 GiB encrypted root
  volume. Monitor memory, disk and OOMKilled pods.

The approved apply summary includes the current instance ID and Elastic IP.
Replacing or destroying the node would lose K3s local-path monitoring and
Traefik certificate data. See
[K3s release and rollback](../../../../../deploy/kubernetes/README.md).
