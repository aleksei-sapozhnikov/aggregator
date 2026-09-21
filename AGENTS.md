# AGENTS.md

## Project

Catalog Health Aggregator translates service-level health signals into a
product-level view across a dependency graph.

The repository is intentionally multi-service and multi-language.

Core services:

- `services-core/aggregator` - Java / Spring Boot backend. Loads catalog and
  signal definitions, polls health endpoints, propagates health through the
  dependency graph, and exposes Prometheus metrics.
- `services-core/catalog` - Go service. Owns catalog data, dependency
  definitions, signal definitions, schemas, and their HTTP API.
- `services-core/aggregator-ui` - React frontend. Displays catalog health,
  dependency impact, and signal history.

Supporting and demo components:

- `services-extra/prometheus` - metrics collection.
- `services-extra/grafana` - metrics visualization.
- `services-demo/chaos-maker` - Python service that changes demo-service state
  to simulate failures.
- `services-demo/dummy-*` - simulated services in multiple languages.

Read `README.md` for the current architecture, behavior, and local-run
instructions before making broad architectural assumptions.

## Engineering guidelines

- Prefer simple, explicit behavior over implicit heuristics.
- Preserve clear service ownership and boundaries.
- Treat HTTP APIs and catalog schemas as contracts between services.
- Keep health-state propagation deterministic. Health severity is ordered as
  `DOWN > UNKNOWN > UP`.
- Do not introduce a new service, framework, persistence layer, or
  infrastructure component unless the problem requires it.
- Keep demo-specific behavior separate from core application behavior.
- When changing a cross-service contract, inspect all producers and consumers.
- Source code, schemas, tests, and repository documentation are the source of
  truth. Generated AI/tooling data is secondary.

## Validation

Use the repository's existing QA tooling rather than introducing parallel
formatting or linting workflows.

For the full check:

```shell
python tools/code_qa/main.py lint
```

Formatting and other QA modes are documented in `README.md`.

When changing an individual service, also run its relevant tests or build
checks when practical.

Do not silently fix unrelated formatting or code while working on a scoped
change.

## Commits

When splitting work into commits, use small meaningful commits. Each commit
should represent one logical change, even when that logical change touches many
files.

Commit messages should be short, simple English sentences that describe the
essence of the change.

Do not use conventional-commit prefixes or category tags such as `feat:`,
`fix:`, `bug:`, or similar.

## Graphify

Graphify is an optional local development tool. The repository must remain
fully usable without it.

When Graphify is available:

- If no graph exists, run `graphify extract .` before using Graphify.
- For codebase and cross-service questions, prefer
  `graphify query "<question>"` before broad source-code searches.
- Use `graphify path "<A>" "<B>"` when investigating relationships between
  components.
- Use `graphify explain "<concept>"` for focused architectural exploration.
- Use the graph to identify relevant code, then verify important conclusions
  against the source code.
- Read `graphify-out/GRAPH_REPORT.md` for broad architecture analysis only
  when scoped queries are insufficient.
- After modifying code, run `graphify update .`.

If Graphify is not installed, continue normally using repository search and
source inspection. Do not install Graphify or other optional tooling merely
to complete a task.

Never treat generated Graphify output as the source of truth.
