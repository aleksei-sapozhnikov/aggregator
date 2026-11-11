# Delegated IAM policies

This directory contains the AWS IAM policy documents consumed by the
[administration OpenTofu root](../README.md). It defines the boundaries
between account/project administration, restricted demo operations,
GitHub deployment workflows and publication automation.

Policies are grouped by their purpose:

- Demo EC2, IAM, security group and SSM management within project tags
  and role boundaries.
- Read-only demo infrastructure planning versus approved plan apply,
  K3s Run Command and state-lock access.
- Session Manager access to tagged instances, including private Argo CD
  port forwarding without public SSH.
- Publication infrastructure permissions and runtime role boundaries.
- Restricted invocation of supported Bedrock models.

To change a permission, edit the relevant JSON policy, inspect its
attachments and conditions in the parent OpenTofu configuration, then
plan and apply **as `infra-admin`** through the administration root.
Do not attach broader permissions directly to workload roles or bypass
the existing permissions boundary. IAM changes are not deployed by the
demo workload pipeline.

See [project IAM ownership](../README.md) and
[demo deployment approvals](../../../../demo/WORKFLOW.md).
