# Hosted demo environments

Two independent AWS deployments exercise the same Aggregator application:

- **Public Compose demo:** [aggregator.alivion.cc](https://aggregator.alivion.cc)
  on the serving EC2 with an Elastic IP and Caddy.
- **K3s GitOps demo:** a separate EC2 running Kubernetes, Traefik and Argo CD.
  HTTPS routing requires the intended hostname even before the Elastic IP
  cutover; a direct request to the K3s public IP can return HTTP 404.

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
While the existing Elastic IP serves Compose/Caddy, both Compose and K3s are
updated. Once the opt-in `EIP_TARGET_K3S` cutover is approved, public HTTPS
is served by K3s Traefik and Compose SSM deployments are skipped. See
[the cutover runbook](infra/README.md#elastic-ip-cutover-last-step).
See [WORKFLOW.md](WORKFLOW.md) for required GitHub Environment settings,
approval rules, flags, secret handling and recovery steps.

## Open the private Argo CD dashboard

Argo CD is intentionally not exposed on a public port. Use an AWS Systems
Manager (SSM) port-forwarding session to reach the dashboard from your
computer. Install the AWS CLI and Session Manager plugin, and authenticate
with a profile authorized to start SSM sessions on the K3s EC2 instance.

In **PowerShell**, discover the running K3s node and open the tunnel:

```powershell
$instanceId = aws ec2 describe-instances --region eu-central-1 --profile aggregator-admin --filters "Name=tag:Name,Values=aggregator-demo-k3s" "Name=instance-state-name,Values=running" --query "Reservations[].Instances[].InstanceId" --output text
aws ssm start-session --region eu-central-1 --profile aggregator-admin --target $instanceId --document-name AWS-StartPortForwardingSession --parameters "portNumber=18080,localPortNumber=8080"
```

Keep the terminal open and visit **https://localhost:8080**. Accept the
self-signed certificate for this local tunnel, then sign in as `admin`
with the configured `ARGOCD_PASSWORD` from the protected GitHub Environment
`demo-infra-apply`. Press Ctrl+C to close the tunnel. If local port 8080 is
busy, replace `localPortNumber=8080` and the URL port consistently.

The tunnel connects to a local-only port forward already maintained by
Ansible on the K3s EC2. No public Argo CD port or SSH is needed. The original
Bash example and troubleshooting steps are in
[Ansible: Private dashboard](ansible/README.md#private-dashboard).

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
