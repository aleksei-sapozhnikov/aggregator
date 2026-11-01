# Demo environment

The serving EC2 runs the Compose demo at [aggregator.alivion.cc](https://aggregator.alivion.cc).
This environment supports both the public Docker Compose deployment and a
separate K3s GitOps deployment. GitHub Actions runs [Demo deploy](../../.github/workflows/demo-deploy.yml)
after [Demo pipeline](WORKFLOW.md) succeeds. Infrastructure lives in [infra/](infra/README.md),
Ansible in [ansible/](ansible/README.md), and deployment scripts in `src/sh/`.

## Image publication and deployment

GitHub Actions verifies the repository and derives a Git tree ID for each
of the eight Docker build contexts. Images missing from GHCR are built and
published; unchanged images are reused. To refresh a base image or remote
dependency, change a build-context input (for example the Dockerfile).

The serving EC2 **does not build images**. GitHub OIDC assumes the scoped
`AggregatorDemoDeployGithub` role and invokes the
`AggregatorDemoDeploy` SSM document on the tagged serving instance.
The document validates the full 40-character source SHA, checks out that
revision from `deploy/demo` as `ec2-user`, derives the same image tags and
runs `make deploy ENV=demo` (Compose `--no-build`). GitHub captures the SSM
command result. No inbound SSH or deploy SSH keys are required.

In GitHub Settings → Environments, `demo` must allow **only**
`deploy/demo`. It needs `AWS_DEMO_DEPLOY_ROLE_ARN` (from
`environments/shared/infra/administration`) and `SSM_INSTANCE_ID` (from `environments/demo/infra`).
GitHub OIDC Environment subjects do not independently restrict branches.

## Diagnostics

```sh
aws ssm describe-instance-information --region eu-central-1
aws ssm get-command-invocation --region eu-central-1 \
  --command-id <command-id> --instance-id <instance-id>
```

From an authorized checkout on the serving EC2, an already published
revision may also be deployed manually:

```sh
cd ~/aggregator-demo/repo
DEPLOY_SHA="$(git rev-parse HEAD)" bash ./environments/demo/src/sh/demo-deploy.sh
```

Run `python3 environments/demo/src/python/image_tags.py list` to inspect content-based
image tags. The UI entrypoint writes public `/config.json` from
`APP_TITLE` and `TIMELINE_DEFAULT_RANGE`; do not put secrets in it.

See [K3s GitOps](../../deploy/kubernetes/README.md) for the independently published
Kubernetes demo and its rollback procedure.
