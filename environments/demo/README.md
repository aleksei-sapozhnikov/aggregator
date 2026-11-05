# Hosted K3s demo

The public [Catalog Health Aggregator](https://aggregator.alivion.cc) runs on
one Amazon Linux 2023 EC2 instance with **K3s**, Traefik, and Argo CD.
The public Elastic IP is managed by OpenTofu; it is not recreated during
normal deployments. Argo CD follows the published GitOps manifests.

This is a demonstration environment, not a production Kubernetes reference.
Local development uses [Docker Compose](../../deploy/compose/README.md).

## Deploy

1. Validate changes in `dev`, then promote the intended commit to `deploy/demo`.
2. The [Demo pipeline](WORKFLOW.md) validates and plans infrastructure.
   Approve changes to AWS or node configuration through `demo-infra-apply`
   after reviewing the exact OpenTofu plan.
3. The separate [Demo deploy](../../.github/workflows/demo-deploy.yml) job
   checks code quality, builds only missing immutable GHCR image tags,
   and publishes `deploy/k8s-live` to `deploy/demo-gitops`.
4. Argo CD syncs the release. Verify the [HTTPS site](https://aggregator.alivion.cc)
   and the `aggregator-demo` Argo CD Application (Synced/Healthy).

The instance does not build application images. GitHub Actions authenticates
to AWS with OIDC and configures the node through SSM, without opening SSH.
Review [workflow controls](WORKFLOW.md), [OpenTofu operations](infra/README.md),
and [K3s release checks](../../deploy/kubernetes/README.md) before changes.

## Open the private Argo CD dashboard

Argo CD is not exposed to the internet. Install AWS CLI and the Session
Manager plugin, authenticate as an AWS identity authorized for SSM sessions,
then open a port-forwarding session.

In PowerShell:

```powershell
$instanceId = aws ec2 describe-instances --region eu-central-1 --profile aggregator-admin --filters "Name=tag:Name,Values=aggregator-demo-k3s" "Name=instance-state-name,Values=running" --query "Reservations[].Instances[].InstanceId" --output text
aws ssm start-session --region eu-central-1 --profile aggregator-admin --target $instanceId --document-name AWS-StartPortForwardingSession --parameters "portNumber=18080,localPortNumber=8080"
```

Keep the terminal open and visit **https://localhost:8080**. Accept the
self-signed certificate for this private tunnel, then sign in as `admin`
with the password managed through the protected GitHub Environment secret
`ARGOCD_PASSWORD`. Press Ctrl+C to close the tunnel. If port 8080 is busy,
change the local port in both the command and browser address.

See [Ansible: Private dashboard](ansible/README.md#private-dashboard) for
the Bash equivalent and operational checks.

## Troubleshooting

Inspect the latest [Demo pipeline](WORKFLOW.md) and Demo deploy jobs.
SSM command output is in CloudWatch Logs
`/aws/ssm/aggregator-demo-k3s`. On the node:

```sh
sudo systemctl is-active k3s
sudo k3s kubectl get pods,svc,ingress -n aggregator
sudo k3s kubectl get applications -n argocd
sudo k3s kubectl -n kube-system logs deployment/traefik --since=30m
```

A completed workflow does not by itself prove that the application is
Synced/Healthy or that HTTPS certificates are valid. Check the public
site without bypassing certificate verification.
