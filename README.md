# Catalog Health Aggregator

Catalog Health Aggregator transforms service-level health signals into a product-level health view of complex systems.

- Traditional observability focuses on service-level metrics and detailed technical diagnostics.
- Service health alone does not answer a product-level question: “What is broken for the customer?”
- Developers see their own service. Product managers and support need to understand impact across the entire dependency
  chain.

This pet project explores an approach to quickly identify why a specific product is not working by making
dependency impact explicit and traceable.

## Demo

- https://aggregator.alivion.cc

The link opens the web UI:

- Left panel: dependency tree with `🟢 UP / 🔴 DOWN / 🟡 UNKNOWN` markers near the title.
- Right panel: details of the selected item, including affecting items and health check status.
- Timeline at the bottom: selected item state over time, together with related dependencies and health checks.

The demo simulates a complex hierarchical catalog of services, products, and product lines.
A product can depend on a service, which can depend on other services or products, and so on.

Service state is collected through health checks.
Right now, a health check is an HTTP endpoint polled by the aggregator on schedule.
Each service returns `UP` or `DOWN`, and the platform uses three states overall: `UP`, `DOWN`, `UNKNOWN`.

State propagation is deterministic:

- If a dependency is `DOWN`, dependent services/products become `DOWN`.
- If no dependency is `DOWN` but at least one is `UNKNOWN`, the parent becomes `UNKNOWN`.
- A parent is `UP` only when all required dependencies are `UP`.

The demo is intentionally dynamic: at least one service is usually broken to make dependency impact visible.

## Technical Overview

### Configuration

Catalog items and health checks are configured in files:

- [catalog.yaml](config/demo/catalog.yaml)
- [health-checks.yaml](config/demo/health-checks.yaml)

### Core Services (`services-core`)

- [aggregator](services-core/aggregator): Java backend (Spring Boot). Polls health check endpoints, aggregates
  service/product state through dependency graph, and exposes Prometheus metrics at `/actuator/prometheus`
  (metric
  semantics: [HealthMetricsDocumentation.java](services-core/aggregator/src/main/java/com/github/vermucht/aggregator/export/HealthMetricsDocumentation.java)).
- [aggregator-ui](services-core/aggregator-ui): User web interface build on React.

### Supporting Monitoring Services (`services-extra`)

- [prometheus](services-extra/prometheus): scrapes and stores metrics from [aggregator](services-core/aggregator).
- [grafana](services-extra/grafana): visualizes collected metrics and powers dashboards used
  by [aggregator-ui](services-core/aggregator-ui).

### Demo Services (`services-demo`)

- [chaos-maker](services-demo/chaos-maker): Python service that randomly breaks and restores demo services to keep the
  demo realistic and dynamic.
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
