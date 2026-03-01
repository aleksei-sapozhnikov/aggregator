# Catalog Health Aggregator

Catalog Health Aggregator transforms service-level health signals into a product-level view of complex systems.

- Traditional observability focuses on service-level metrics and technical diagnostics.
- Service health alone does not answer a product-level question: “What is broken for customers?”
- Developers see their own service, while product and support teams need to understand customer impact across
  dependencies.

This pet project explores an approach to quickly identify why a specific product is not working by making
dependency impact explicit and traceable.

## Demo

- https://aggregator.alivion.cc

The link opens the web UI:

- Left panel: dependency tree with `🟢 UP / 🔴 DOWN / 🟡 UNKNOWN` markers near the title.
- Right panel: details of the selected item, including affecting items and health check status.
- Timeline at the bottom: selected item state over time, together with related dependencies and health checks.

The demo simulates a complex hierarchical catalog of services, products, and product lines.
It includes three product family branches, divided into products and services up to six levels deep.
A product can depend on a service, which can depend on other services or products, and so on.

Service state in the demo is collected from HTTP health checks (`UP`/`DOWN`) and aggregated into three states:
`UP`, `DOWN`, `UNKNOWN`.

## Technical Overview

### Design Choices

- Health checks via HTTP endpoints: This is the simplest mechanism for the first working prototype and leaves room for
  future push-based updates or external probes.
- Deterministic state propagation: A strict _worst-of rule_ is used for dependencies: `DOWN` dominates, then
  `UNKNOWN`, otherwise `UP`. This keeps impact analysis clear and predictable across the dependency graph.
- Metrics and visualization stack: Prometheus stores metrics, Grafana visualizes them; both integrate well with
  Spring Boot and keep dashboarding simple.
- Dynamic demo behavior: [chaos-maker](services-demo/chaos-maker) injects failures into dummy services so dependency
  impact remains visible without manual intervention.

### Configuration

Catalog items and health checks are configured through YAML files. Demo example:

- [demo/catalog-definition.yaml](config/demo/catalog-definition.yaml)
- [demo/http-poll-signals.yaml](config/demo/http-poll-signals.yaml)

### Core Services (`services-core`)

- [aggregator](services-core/aggregator): Java backend (Spring Boot). Polls health check endpoints, aggregates
  service/product state through dependency graph, and exposes Prometheus metrics at `/actuator/prometheus`.
  Metric
  semantics: [HealthMetricsDocumentation.java](services-core/aggregator/src/main/java/com/github/vermucht/aggregator/export/HealthMetricsDocumentation.java).
- [aggregator-ui](services-core/aggregator-ui): User web interface built with React.

### Supporting Monitoring Services (`services-extra`)

- [prometheus](services-extra/prometheus): scrapes and stores metrics from [aggregator](services-core/aggregator).
- [grafana](services-extra/grafana): visualizes collected metrics and powers dashboards used
  by [aggregator-ui](services-core/aggregator-ui).

### Demo Services (`services-demo`)

- [chaos-maker](services-demo/chaos-maker): Python service that randomly breaks and restores services to keep the demo
  realistic and dynamic.
- [dummy-java](services-demo/dummy-java), [dummy-python](services-demo/dummy-python),
  [dummy-javascript](services-demo/dummy-javascript): simulated product services (Java/Python/JavaScript) with health
  endpoint for aggregator polling and a state-change endpoint (`UP`/`DOWN`) used
  by [chaos-maker](services-demo/chaos-maker).

## Run Locally

You need:

- Docker or Podman with Compose support
- Optionally `make` utility, available on Windows via [GnuWin](https://sourceforge.net/projects/gnuwin32/).

Clone or download the repository and open its root folder in terminal.

First run can take a while, as it will download Docker images.

### Option 1: Make (recommended)

Start default stack (local-demo)

```bash
make up
```

Stop default stack (local-demo)

```bash
make down
```

Show help and other available commands

```bash
make help
```

### Option 2: Manual Compose commands

Examples below are using Docker.
If you use Podman, replace `docker compose` with `podman compose`.

Start default stack (local-demo)

```bash
docker compose --project-name aggregator-local-demo -f compose.yaml -f compose.local-demo.yaml -f compose.overlay.demo-services.yaml -f compose.overlay.local-ports.yaml -f compose.overlay.demo-services-local-ports.yaml up --detach --remove-orphans
```

Stop default stack (local-demo)

```bash
docker compose --project-name aggregator-local-demo -f compose.yaml -f compose.local-demo.yaml -f compose.overlay.demo-services.yaml -f compose.overlay.local-ports.yaml -f compose.overlay.demo-services-local-ports.yaml down --remove-orphans
```

For additional options see [Makefile](./Makefile)
