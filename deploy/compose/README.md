# Docker Compose environments

Compose defines the local development stack and the hosted Docker Compose demo.
It connects the catalog, health aggregator, web UI, optional AI agent,
Prometheus, and Grafana. Demo environments additionally run dummy services
and the [failure simulator](../../services/chaos-maker/README.md).

## Start locally

From the repository root, with Docker or Podman and Compose installed:

```sh
make up                       # Full local demo (default)
make up ENV=local             # Core services without demo failures
make down                     # Stop and keep data volumes
```

Open `http://localhost:3000`. Other development ports, AI credentials,
service rebuilds, and equivalent direct Compose commands are documented in
[Running locally](../../docs/running-locally.md). Use the repository
`Makefile` to select a supported combination; individual Compose fragments
are not complete, standalone deployments.

## Hosted demo

`ENV=demo` consumes published GHCR images rather than building on the EC2
instance. Releases are normally delivered by
[Demo deploy](../../environments/demo/README.md) through GitHub Actions and
AWS SSM. The serving host uses `make deploy ENV=demo` with image
references derived from the approved source revision. Do not manually
invent `IMAGE_TAG` values; individual services have content-based tags.

The `demo` Compose setup also configures the public Caddy proxy.
K3s GitOps is a **separate** deployment, described in
[Kubernetes](../kubernetes/README.md).

## Configuration boundaries

- The root `.env` supplies non-secret project settings such as
  `PROJECT_VERSION`; do not put keys or AWS credentials in this tracked file.
- Local overlays publish debugging and development ports. The hosted demo
  uses its own networking and image settings.
- `APP_TITLE` and `TIMELINE_DEFAULT_RANGE` are published in the UI's
  `/config.json`; never put secrets there.
- The base AI agent is disabled unless enabled by an environment-specific
  configuration. See [local AI setup](../../docs/running-locally.md#optional-ai-agent).
- Named Prometheus and Grafana volumes survive `make down` but are deleted
  by `make clean`. Do not run destructive clean commands against a hosted
  environment without reviewing the data loss.
