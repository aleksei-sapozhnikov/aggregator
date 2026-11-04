# Hosted demo environments

Two independent AWS deployments exercise the same Aggregator application:

- **Public Compose demo:** [aggregator.alivion.cc](https://aggregator.alivion.cc)
  on the serving EC2 with an Elastic IP and Caddy.
- **K3s GitOps demo:** a separate EC2 running Kubernetes, Traefik and Argo CD,
  accessible over HTTP at its current public IP (no DNS or TLS).

Neither environment is a production-ready reference deployment.

## Deploy a release

Deployment is controlled by the GitHub Actions
[Demo pipeline](WORKFLOW.md) and [Demo deploy](../../.github/workflows/demo-deploy.yml).
A commit to `dev` alone does **not** deploy. The release source branch is
`deploy/demo`:

1. Push the intended, validated source revision to `deploy/demo`.
2. Check the infrastructure workflow plan. If infrastructure or Ansible
   changed, an approved `demo-infra-apply` run may be required.
3. Check the subsequent `Demo deploy` run. It publishes or reuses
   content-tagged GHCR images, deploys the Compose instance via AWS SSM,
   and publishes the K3s manifest snapshot for Argo CD to sync.
4. Verify the public Compose URL separately from the K3s endpoint and
   Argo CD Synced/Healthy status.

The EC2 instances do not build service images. AWS authentication uses
GitHub OIDC and SSM, with no inbound SSH or stored deploy keys.
See [WORKFLOW.md](WORKFLOW.md) for required GitHub Environment settings,
approval rules, flags, secret handling and recovery steps.

## Diagnose and operate

Inspect the corresponding GitHub Actions job first. AWS SSM command logs
and the current node details are available to authorized operators:

```sh
aws ssm describe-instance-information --region eu-central-1
aws ssm get-command-invocation --region eu-central-1 \
  --command-id <command-id> --instance-id <instance-id>
```

For existing published Compose revisions, an operator on the serving
instance can run the versioned deployment script after verifying its
checkout and full revision SHA. Avoid manually changing images or
branches outside the release workflow.

Further operations are documented where they are owned:
[demo infrastructure](infra/README.md),
[Ansible/K3s node configuration](ansible/README.md),
[K3s release and rollback](../../deploy/kubernetes/README.md), and
[project IAM and state](../shared/README.md).
