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

When changing an individual service, also run its relevant tests or build
checks when practical.

Do not silently fix unrelated formatting or code while working on a scoped
change.

## QA and developer tooling

Never invoke repository QA helper scripts under `tools/code_qa` for any reason.
This includes, but is not limited to, `python tools/code_qa/main.py qa`,
`python tools/code_qa/main.py lint`, and `python tools/code_qa/main.py format`.
These scripts are reserved for humans and must not be used by agents, even when
doing broad repository validation.

Do not invoke `make` commands at all. This includes repository-level targets
such as `make code-qa`, `make code-lint`, `make code-format`,
`make deps-audit`, and service/runtime targets. If validation is needed, run
the smallest direct service-level command instead, or ask the user before using
any `make` target.

Repository-level QA helpers under `tools/code_qa`, `make code-qa`,
`make code-lint`, `make code-format`, `make deps-audit`, and similar aggregate
developer tooling are intended for human use.

Do not run repository-wide QA, formatting, linting, dependency audit, or helper
tooling. If the user asks for broad validation, ask which direct service-level
commands they want to run instead.

For scoped code changes, run only the relevant service-level tests or build
checks when practical. Prefer the smallest validation command that directly
covers the changed service.

Do not run formatting tools across unrelated files. If a formatter is required,
run it only on files changed for the current task, unless the user explicitly
requests broader formatting.

When the user says "run tests" or "run relevant checks", this does not imply
running repository-wide QA helpers. Treat repository-wide QA as opt-in only.

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
