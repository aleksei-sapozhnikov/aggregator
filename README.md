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

Catalog items and health signal sources are configured in YAML files. Demo example:

- [demo/catalog-items.yaml](config/demo/catalog-items.yaml)
- [demo/catalog-dependencies.yaml](config/demo/catalog-dependencies.yaml)
- [demo/signals-http-poll.yaml](config/demo/signals-http-poll.yaml)
- [schemas/catalog-items.schema.yaml](config/schemas/catalog-items.schema.yaml)
- [schemas/catalog-dependencies.schema.yaml](config/schemas/catalog-dependencies.schema.yaml)
- [schemas/signals-http-poll.schema.yaml](config/schemas/signals-http-poll.schema.yaml)

Catalog format notes:

- `catalog-items.yaml`: each item has `id` and human-readable `title`.
- `catalog-dependencies.yaml`: each relation has `sourceId` and `targetId`.
- Item/dependency `type` fields were removed from the catalog definition.

### Core Services (`services-core`)

- [aggregator](services-core/aggregator): Java backend (Spring Boot). Collects signals from service health check
  endpoints, aggregates service/product state through the dependency graph, and exposes Prometheus metrics at
  `/actuator/prometheus`. Metric semantics:
  [HealthMetricsDocumentation.java](services-core/aggregator/src/main/java/com/github/vermucht/aggregator/export/HealthMetricsDocumentation.java).
- [aggregator-ui](services-core/aggregator-ui): User web interface built with React.

### Supporting Services (`services-extra`)

- [prometheus](services-extra/prometheus): scrapes and stores metrics from [aggregator](services-core/aggregator).
- [grafana](services-extra/grafana): visualizes collected metrics and powers dashboards used
  by [aggregator-ui](services-core/aggregator-ui).

### Demo Services (`services-demo`)

- [chaos-maker](services-demo/chaos-maker): Python service that randomly breaks and restores services to keep the demo
  realistic and dynamic.
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

The repository uses a single `prek` pipeline configured in `prek.toml` for formatting and checks across languages:

- Java: `google-java-format`
- Python: `ruff-check` + `ruff-format`
- TypeScript / JavaScript / JSON / YAML / Markdown / CSS / HTML: `prettier`
- Generic text hygiene: trailing whitespace, merge markers, JSON/YAML validity, single final newline
- Secrets: `trufflehog` (pre-push + CI)

Pre-commit runs in **check-only** mode (no auto-format edits).
Manual formatting is executed explicitly by running the formatter script.
In GitHub Actions checks run on `ubuntu-latest` runner with pinned CI tool versions.
CI executes `python tools/code_qa.py check-all`.

### Install local hooks

Any OS:

```bash
python tools/setup_tools.py --prek-version 0.3.6 --install-hooks
```

`python tools/setup_tools.py` installs pinned QA tools (`prek`).
If you also want to install hooks in the same command, add `--install-hooks`.
If you only want tool installation, use:

```bash
python tools/setup_tools.py --prek-version 0.3.6
```

If tools are already installed, you can run only:

```bash
python tools/code_qa.py install-hooks
```

On Windows, if `python` is unavailable in PATH, use `py -3` instead.
After installation, commits from command line and IntelliJ IDEA Git UI will run git hooks via `prek` automatically.

### Run formatting/checks manually

```bash
python tools/code_qa.py check-code
python tools/code_qa.py format-code
python tools/code_qa.py check-secrets
python tools/code_qa.py check-all
```

`python tools/code_qa.py check-code` runs validation only and never auto-formats files.
`python tools/code_qa.py format-code` formats only failed checks, then runs full check again.
`python tools/code_qa.py check-secrets` prints compact output (`Checking secrets.. OK/FAILED` + `N secrets found`).
`python tools/code_qa.py check-all` runs check + secrets and always prints final status line.
Each command finishes with `=== QA: PASSED ===` or `=== QA: FAILED ===`.
Use `python tools/code_qa.py check-secrets --raw` for full trufflehog JSON output.
