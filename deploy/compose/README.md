# Docker Compose for local development

Compose provides the local catalog, Aggregator, UI, optional AI agent,
Prometheus, Grafana, and sample services.

## Start locally

Run from the repository root with Docker or Podman and Compose installed:

```sh
make up
make up ENV=local
make down
```

`local-demo` is the default full-stack environment with dummy services and
chaos-maker. `local` starts the core services without the demo failure
simulation. Open `http://localhost:3000` after startup.

The fragments in this directory are composed by the root `Makefile`; do not
treat an individual fragment as a complete deployment. See
[Running locally](../../docs/running-locally.md) for ports, credentials,
rebuild commands, and direct Compose equivalents.

## Configuration

- The tracked root `.env` holds non-secret project settings, including
  `PROJECT_VERSION`.
- Local overlays expose development ports; do not use them for public hosting.
- `APP_TITLE` and `TIMELINE_DEFAULT_RANGE` are public UI configuration keys.
- The base AI agent remains disabled until the selected local overlay enables it.
- `make down` preserves named volumes; `make clean` removes them.

The public hosted demo runs on K3s, not Compose. Its infrastructure and
GitOps workflow are described in [Hosted demo](../../environments/demo/README.md).
