# Catalog Health Aggregator

Catalog Health Aggregator transforms service-level health signals into a product-level view of complex systems.

In systems built from many shared services and multi-level dependencies, the visible product failure is often only
the last symptom. The real cause may sit several levels deeper in a small technical service owned by another team.
This project makes that chain explicit, so teams can get from "something is broken" to a likely root cause faster.

- Traditional observability focuses on service-level metrics and technical diagnostics.
- Service health alone does not answer a product-level question: “What is broken for customers?”
- Developers see their own service, while product and support teams need to understand customer impact across
  dependencies.

This pet project explores a simple way to make dependency impact explicit and traceable.
When a product is down, owners should not have to message every team asking "is this yours?" Instead, the dependency
graph should point to the most probable broken service and help route the incident directly to the team that can
actually fix it.

## Demo

- https://aggregator.alivion.cc

The demo provides a web UI:

- Left panel: dependency tree with health state markers near the title.
- Right panel: details for the selected item, including its own health signals, items contributing to the failure (if
  present) and their signals.
- Timeline at the bottom: selected item state over time, together with related dependencies and signal history.

The demo simulates a hierarchical catalog of services, products, and product lines.
It includes three product family branches, split into products and services up to six levels deep.
A product can depend on a service, which can depend on other services or products, and so on.

The current version builds product state from signals collected through HTTP endpoints. These signals can represent
different kinds of checks, such as health checks, SLI-style indicators, and other service-specific status signals.
Services expose an endpoint, the aggregator polls it periodically, and converts the result into `UP`, `DOWN`, or
`UNKNOWN`.
`UNKNOWN` is used when no usable health signal is available, most often because a service does not provide one.
Catalog definitions and signal definitions are served by a dedicated `catalog` service over HTTP API.
Other services consume catalog data from that API at startup.

Polling is used here because it is the simplest way to get a working signal path in the first version. A future
extension can add ingestion, where services push updates into the aggregator directly.

## Technical Overview

### Design Choices

- Health signals via HTTP health checks: Simple for the first working prototype and compatible with future push-based
  updates or external probes.
- Deterministic state propagation: A strict _worst-of rule_ is used for dependencies: `DOWN` dominates, then
  `UNKNOWN`, otherwise `UP`. This keeps impact analysis clear and predictable across the dependency graph.
- Metrics and visualization stack: Prometheus stores metrics, Grafana visualizes them; both integrate well with
  Spring Boot and keep dashboarding simple.
- Dynamic demo behavior: [chaos-maker](services-demo/chaos-maker) injects failures into dummy services so that
  dependency
  impact remains visible without manual intervention.

### Configuration

Catalog items and health signal sources are stored in the dedicated
[catalog](services-core/catalog) service.
The service keeps file-based variants and schemas:

- [catalog/demo](services-core/catalog/catalog/demo)
- [catalog/empty](services-core/catalog/catalog/empty)
- [catalog/schemas](services-core/catalog/schemas)

Compose selects the active variant through `CATALOG_DIR` (for example `./catalog/demo`).

Catalog format notes:

- `catalog-items.yaml`: each item has `id` and human-readable `title`.
- `catalog-dependencies.yaml`: each relation has `sourceId` and `targetId`.
- Item/dependency `type` fields were removed from the catalog definition.

### Core Services (`services-core`)

- [aggregator](services-core/aggregator): Java backend (Spring Boot). Loads catalog and signal-source definitions
  from `catalog` API, polls service health check endpoints, aggregates service/product state through the dependency
  graph, and exposes Prometheus metrics at
  `/actuator/prometheus`. Metric semantics:
  [HealthMetricsDocumentation.java](services-core/aggregator/src/main/java/com/github/vermucht/aggregator/export/HealthMetricsDocumentation.java).
- [aggregator-ui](services-core/aggregator-ui): User web interface built with React. Reads catalog data from
  `catalog` API (proxied via Caddy under `/catalog/*`).
- [catalog](services-core/catalog): Go service that owns catalog data and schemas, validates loaded catalog files at
  startup, and exposes catalog/signal definitions via HTTP API.

### Supporting Services (`services-extra`)

- [prometheus](services-extra/prometheus): scrapes and stores metrics from [aggregator](services-core/aggregator).
- [grafana](services-extra/grafana): visualizes collected metrics and powers dashboards used
  by [aggregator-ui](services-core/aggregator-ui).

### Demo Services (`services-demo`)

- [chaos-maker](services-demo/chaos-maker): Python service that randomly breaks and restores services to keep the demo
  realistic and dynamic. It gets signal targets from `catalog` API.
- [dummy-java](services-demo/dummy-java), [dummy-python](services-demo/dummy-python),
  [dummy-javascript](services-demo/dummy-javascript): simulated product services (Java/Python/JavaScript) with health
  check endpoint for aggregator polling and a state-change endpoint (`UP`/`DOWN`) used
  by [chaos-maker](services-demo/chaos-maker).

## Run Locally

You need:

- Docker or Podman with Compose support
- Optionally `make` utility, available on Windows via [GnuWin](https://sourceforge.net/projects/gnuwin32/).

Clone or download the repository and open its root folder in terminal.

First run can take a while, as it will download Docker images.

After startup, open the service in your browser at http://localhost:3000.

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

## Code Formatting And Checks

`code_qa` and git hooks are split:

- `tools/code_qa/*` runs manual/CI code checks directly (no `prek` runtime dependency).
- `tools/git_hooks/*` installs and configures git hooks via `prek`.

Pre-commit mode is selectable during hook installation:

- `lint-only`: check-only, no file edits.
- `format-and-lint`: format, then lint; commit fails if files were changed by hook.
- In GitHub Actions checks run on `ubuntu-latest` runner with pinned CI tool versions.
  CI executes `python tools/code_qa/main.py lint`.

### Install local hooks

Any OS:

```bash
python tools/git_hooks/setup_prek.py
python tools/git_hooks/setup_git_hooks.py --mode lint-only
```

`python tools/git_hooks/setup_prek.py` installs pinned `prek`.
`python tools/git_hooks/setup_git_hooks.py --mode ...` installs git hooks for the selected behavior.
Both pre-commit and pre-push are installed from `prek.toml`.
Selected pre-commit mode is stored in local git config key `hooks.qaMode`.
If you only want tool installation with custom version, use:

```bash
python tools/git_hooks/setup_prek.py --prek-version 0.3.6
```

If tools are already installed, you can run only:

```bash
python tools/git_hooks/setup_git_hooks.py --mode format-and-lint
```

On Windows, if `python` is unavailable in PATH, use `py -3` instead.
After installation, commits from command line and IntelliJ IDEA Git UI will run git hooks via `prek` automatically.

### Run formatting/checks manually

Manual `code_qa` requires local tools:

```bash
python -m pip install --upgrade ruff pyyaml
npm install --global prettier@3.6.2
```

```bash
make code-qa
python tools/code_qa/main.py
python tools/code_qa/main.py format
python tools/code_qa/main.py format-check-only
python tools/code_qa/main.py lint
```

`make code-qa` and `python tools/code_qa/main.py` run format-and-lint plus secrets scan.
`format` runs checks, formats failed check groups (for example `prettier`, `final newline`, `java format`), then re-checks.
`format-check-only` runs only code checks (no formatting, no secrets scan).
`lint` runs check-only code validation plus secrets scan (CI mode).
Each command finishes with `=== QA: PASSED ===` or `=== QA: FAILED ===`.
