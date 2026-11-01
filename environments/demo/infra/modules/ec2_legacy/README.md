# Serving Compose EC2 module

OpenTofu module for the existing public Docker Compose demo host. It owns
the EC2 instance, workload role and instance profile, network rules,
and Elastic IP needed for a stable public entrypoint. These resources
are distinct from the optional K3s instance.

This module is used by the [demo infrastructure root](../../README.md);
operate it through that root's `tofu plan` and approved apply procedure,
not as a standalone OpenTofu deployment. Its caller supplies VPC, subnet,
AMI, compute settings and optional policy attachments. Use `volume_tags`
for new volumes or `root_volume_tags` for an existing root volume;
outputs expose the instance, network and IAM identifiers.

Destruction is protected for serving resources. Treat any planned
replacement or removal of the public instance or Elastic IP as an
outage-risk change requiring separate review.
