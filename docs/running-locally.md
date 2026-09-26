# Running Locally

This repository is designed to run through Docker Compose. The default local
environment is `local-demo`: core services, demo services, Prometheus, Grafana,
and chaos-maker.

## Prerequisites

- Docker or Podman with Compose support.
- Optional: `make`. On Windows it can be installed through tools such as
  [GnuWin](https://sourceforge.net/projects/gnuwin32/).

The first startup can take a while because images are downloaded and local
service images are built.

## Recommended path

From the repository root:

```shell
make up
```

Open the UI:

```text
http://localhost:3000
```

Stop the stack:

```shell
make down
```

Show available targets:

```shell
make help
```

## Compose environments

`Makefile` supports three environments:

- `local-demo` (default): full local demo with dummy services and chaos-maker.
- `local`: core stack without demo service overlay.
- `demo`: hosted demo stack with public Caddy configuration.

Examples:

```shell
make up ENV=local
make rebuild-recreate ENV=local-demo
make down ENV=demo
```

## Local ports

The default local demo exposes:

- UI: `http://localhost:3000`
- Aggregator API and actuator endpoints: `http://localhost:8080`
- Aggregator debug port: `localhost:5005`
- Grafana: `http://localhost:3001`
- Prometheus: `http://localhost:9090`
- Catalog API: `http://localhost:8084`
- Dummy Java service: `http://localhost:8081`
- Dummy Python service: `http://localhost:8082`
- Dummy JavaScript service: `http://localhost:8083`

## Manual Compose commands

Examples below use Docker. If you use Podman, replace `docker compose` with
`podman compose`.

To start the default local demo, run this command from the repository root:

```shell
docker compose --project-name aggregator-local-demo --project-directory . -f compose/compose.yaml -f compose/compose.local-demo.yaml -f compose/compose.overlay.demo-services.yaml -f compose/compose.overlay.local-ports.yaml -f compose/compose.overlay.demo-services-local-ports.yaml up --detach --wait --remove-orphans
```

To stop it, run this command from the repository root:

```shell
docker compose --project-name aggregator-local-demo --project-directory . -f compose/compose.yaml -f compose/compose.local-demo.yaml -f compose/compose.overlay.demo-services.yaml -f compose/compose.overlay.local-ports.yaml -f compose/compose.overlay.demo-services-local-ports.yaml down --remove-orphans
```

The compose files live under `compose/`. Keep `--project-directory .` in manual
commands so relative paths and the root `.env` file resolve from the repository
root. The `Makefile` is the source of truth for supported compose combinations
and service-scoped commands.
