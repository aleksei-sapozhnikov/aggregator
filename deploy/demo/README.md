# Aggregator Demo Deployment

The hosted demo is deployed only from the `demo` branch. GitHub Actions runs
the code checks, builds and publishes eight GHCR images tagged with the full
commit SHA, and then dispatches the deployment with AWS Systems Manager.
The EC2 host only pulls and starts published images; it does not build them.

## Transport and permissions

GitHub Actions obtains short-lived AWS credentials with GitHub OIDC. The
`AggregatorDemoDeployGithub` role can only run the
`AggregatorDemoDeploy` SSM document on the tagged serving EC2 instance and
read command results. No SSH keys or inbound SSH are needed for deployment.

SSM Agent executes the document with root privileges but switches to
`ec2-user` before accessing the checkout or Docker. The document accepts
only a 40-character hexadecimal Git SHA, then:

1. Fetches `demo` and verifies that the SHA belongs to that branch.
2. Checks out precisely that SHA so mounted Caddy/Prometheus/Grafana files
   match the Docker image versions.
3. Runs `demo-deploy.sh` on the instance to pull images and execute
   `make deploy ENV=demo` (Compose uses `--no-build`).
4. Reports the command result and captured stdout/stderr back to Actions.

## Cutover preparation (before updating the demo branch)

1. In `deploy/infra/admin`, review and apply the new GitHub OIDC provider and
   restricted IAM role with appropriate IAM administrator credentials. If the
   account already has an OIDC provider for GitHub, **import** that provider
   into Terraform instead of creating a duplicate.
2. In `deploy/infra/demo`, review and apply the SSM document and
   `AmazonSSMManagedInstanceCore` role attachment. Reject any unrelated
   destructive or EC2 replacement plans.
3. Confirm the serving instance is **Online** in AWS Systems Manager and
   its SSM Agent is at least **3.3.2746.0**. It needs outbound HTTPS.
4. In GitHub Settings → Environments → `demo`, add environment variables
   `AWS_DEMO_DEPLOY_ROLE_ARN` (output `github_demo_deploy_role_arn`) and
   `SSM_INSTANCE_ID` (output `instance_id` from the demo root).
   **Restrict deployment branches to `demo` only**, because the IAM OIDC
   trust policy uses an environment subject, not a branch subject.
5. Update the `demo` branch from the tested `dev` branch. The workflow
   will publish images, then run SSM to deploy. Check the GitHub job output.
6. Only after a successful SSM deploy, set `enable_legacy_ssh=false`
   in the demo root and apply again. Remove old GitHub `SSH_HOST`,
   `SSH_KEY`, and `SSH_HOST_KEY` environment secrets.

The trust policy assumes the legacy OIDC subject format. If immutable OIDC
subject claims were enabled for this older repository, use its actual
subject format in the policy before running Actions.

## Operations

Check managed node status and command output in AWS:

```sh
aws ssm describe-instance-information --region eu-central-1
aws ssm get-command-invocation --region eu-central-1 \
  --command-id <command-id> --instance-id <instance-id>
```

Manual deployment of an already published commit from the EC2 checkout:

```sh
cd ~/aggregator-demo/repo
IMAGE_TAG=<published-sha> make deploy ENV=demo
```

The UI uses one image for every environment. Its entrypoint writes public
`/config.json` from `APP_TITLE` and `TIMELINE_DEFAULT_RANGE`; do not put
secrets in browser-visible settings.
