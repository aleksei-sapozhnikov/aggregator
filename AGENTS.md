# AGENTS.md

## Project

Catalog Health Aggregator translates service-level health signals into a
product-level view across a dependency graph.

The repository is intentionally multi-service and multi-language.

Core services:

- `services/aggregator` - Java / Spring Boot backend. Loads catalog and
  signal definitions, polls health endpoints, propagates health through the
  dependency graph, and exposes Prometheus metrics.
- `services/catalog` - Go service. Owns catalog data, dependency
  definitions, signal definitions, schemas, and their HTTP API.
- `services/aggregator-ui` - React frontend. Displays catalog health,
  dependency impact, and signal history.

Supporting and demo components:

- `services/prometheus` - metrics collection.
- `services/grafana` - metrics visualization.
- `services/chaos-maker` - Python service that changes demo-service state
  to simulate failures.
- `services/dummy-*` - simulated services in multiple languages.

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

### Explicit publication-preparation exception

When the user explicitly requests release/publication preparation using
`.local/publisher/codex-publication-preparation/codex-instructions.md`,
the agent **must** run the required QA on every prepared publication PR branch,
including version-boundary branches. Use isolated worktrees under
`.local/publisher/worktrees/`; do not change the primary checkout.

The approved commands are:

- `make qa-format` if the branch's Makefile supports it.
- Otherwise, for an older branch without `qa-format`, `make code-format`
  followed by `make qa`.
- Local commands invoked by the above QA workflow, including test executors,
  formatters, linters, secret scans, `make -n qa-check`, and **offline**
  OpenTofu `fmt`, `init -backend=false -lockfile=readonly -input=false`,
  and `validate`. Installing required local toolchains and downloading
  declared providers for offline validation are permitted.

The OpenTofu QA exception permits local formatting and syntax/configuration
validation only. Do **not** run `tofu plan`, `apply`, `destroy`, `import`,
state-changing commands, or `init` with a remote backend; do not run AWS CLI,
access live infrastructure, deploy resources, or load cloud credentials.
If a QA command unexpectedly requires remote infrastructure access, stop
that operation and ask for explicit approval instead of bypassing checks.

Read publication guidance from its stable private path and the pinned
`.local/publisher/reference-dev/AGENTS.md` reference when available.
A historical branch's older Makefile determines which QA target exists.
The preparation task does not authorize unrelated Make targets or changes to
`main` or `dev`.

Repair QA failures and rerun the checks on affected branches. Never report
a branch as QA-passing because only Publisher's offline tests passed.

### Ordinary development tasks

Outside the explicitly authorized publication-preparation workflow, agents
must **not** run repository QA helpers under `tools/code_qa`, any `make`
target, repository-wide formatting, linting, dependency audits, or other
aggregate developer tooling. Those are reserved for humans.

For ordinary scoped changes, run the smallest direct service-level tests
or build checks when practical. Do not apply formatters to unrelated files.

A generic request to "run tests" or "run relevant checks" does not grant
permission to execute Make or repository-wide QA.

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
