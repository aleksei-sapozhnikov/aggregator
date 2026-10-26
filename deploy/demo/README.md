# Aggregator Demo Deployment

The hosted demo deploys from the `demo` branch only. Commits to `dev` or
`main` do not redeploy it.

## Pipeline

1. Shared repository checks run before any publication.
2. GitHub Actions builds eight project-owned images and publishes them to GHCR,
   tagged with the full Git commit SHA.
3. The SSH job checks out that exact commit on EC2, runs Compose pull, then
   Compose up with `--no-build`. Chaos-maker starts after the other services.
4. Compose still mounts Caddy, Prometheus, and Grafana configuration from the
   Git checkout. SSH and Git remain in use for this phase.

See [the workflow](/.github/workflows/demo-deploy.yml) and
[the SSH script](demo-deploy.sh).

## Prerequisites

- EC2 is bootstrapped for Docker Compose, Git, Make, and SSH.
- The existing checkout is at `/home/ec2-user/aggregator-demo/repo`.
- The GitHub `demo` environment has `SSH_HOST`, `SSH_KEY`, and
  `SSH_HOST_KEY` secrets.
- All eight GHCR packages must be **public** for unauthenticated pulls on EC2.
  Newly published packages default to private. After their first publication,
  switch their visibility in GitHub's package settings. Until then, pulls
  without registry authentication will fail.
- The workflow publishes with `GITHUB_TOKEN` and `packages: write`; no
  personal access token is needed.

## Manual deployment of an already published commit

```sh
cd ~/aggregator-demo/repo
export IMAGE_TAG=<full-40-character-commit-sha>
make deploy ENV=demo
curl -f https://aggregator.alivion.cc/
```

`make deploy` downloads the published images and starts them without a build.
`make pull ENV=demo` only downloads images. Image tags are pinned to the
exact commit, not `latest`.

The UI image has no environment-specific build arguments. Its entrypoint
generates `/config.json` from `APP_TITLE` and `TIMELINE_DEFAULT_RANGE`.
React loads this configuration before rendering. These are public browser
settings and must never contain credentials.

The `demo` branch does not yet exist. Create or advance it only when ready
to publish and deploy a tested commit; there is no auto-deploy from `dev`.
