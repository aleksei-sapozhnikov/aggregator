# Catalog Health Aggregator

Catalog Health Aggregator shows how failures in technical services affect
user-facing products and helps explain why a product is unhealthy.

It does this by translating service-level health signals into an explainable
product-level view.

This is a pet project I work on in my free time.

---

## Try the live demo

Open the live demo: https://aggregator.alivion.cc

The demo changes automatically: sample services periodically fail and recover,
making their impact visible across products and dependencies.

What to look at:

- The dependency tree on the left shows the current health of products,
  services, and shared components.
- Select any item to inspect its health signals and dependencies, see who owns
  it, and find the available contact channels.
- On a `DOWN` item, the `Affecting now` section shows the signals currently
  responsible for its state and separates its own failed checks from failures
  inherited from dependencies.
- Select an affected dependency to jump directly to its details, even when it
  is several levels below the product in the dependency tree.
- The timeline and dashboards show recent state changes, Prometheus metrics,
  and Grafana panels.

---

## What problem it solves

Monitoring normally reports the health of individual technical components.
Users and product owners, however, experience problems at the product level.

The aggregator connects these two views. It combines service-level signals with
a catalog of products, dependencies, and ownership, then propagates health
through the dependency graph.

For example, if a shared authentication service fails, several products may
become unavailable at once. The aggregator shows the affected products while
keeping the shared dependency visible as the likely source of the problem.

The goal is to answer not only "which service is unhealthy?", but also "what is
broken for users, what depends on it, and where is the likely root cause?"

---

## How it works

At a high level, the system combines service-level signals with catalog
relationships, computes Product Health deterministically, and exposes that state
through the UI, observability stack, and an optional AI assistant.

```mermaid
flowchart LR
  ui["Web UI"]

  subgraph experience["UI integrations"]
    direction TB
    agent["AI assistant"]
    dashboards["Dashboards / history"]
  end

  ui --> agent
  ui --> dashboards

  aggregator["Aggregator"]

  subgraph inputs["Data inputs"]
    direction TB
    catalog["Catalog"]
    signals["Health signals"]
  end

  agent --> aggregator
  dashboards --> aggregator

  aggregator --> catalog
  aggregator --> signals
```

The LLM is not part of Product Health calculation. Health state is derived from
catalog relationships and service signals before any AI interaction happens.

### Product Health data flow

The aggregator combines catalog relationships with health signals and exposes
the resulting deterministic Product Health state through two interfaces.

```mermaid
flowchart LR
  catalog["Catalog"] --> aggregator["Aggregator"]
  signals["Health signals"] --> aggregator

  aggregator -->|REST API| consumers["Web UI / AI agent"]
  aggregator -->|Exported metrics| observability["Prometheus / Grafana"]
```

Both paths are derived from the same deterministic Product Health state.

### AI-assisted investigation flow

The optional AI agent uses the model to interpret a natural-language question
and choose which Product Health data to retrieve. The agent then queries the
deterministic Product Health API. If the structured tool result is sufficient,
the agent renders the response directly; otherwise, it sends the retrieved facts
back to the model for explanation.

```mermaid
sequenceDiagram
  actor User
  participant Agent as AI Agent
  participant Model as Model Provider
  participant Health as Product Health API

  User->>Agent: Natural-language question
  Agent->>Model: Question + tool definitions
  Model-->>Agent: Tool call
  Agent->>Health: Query health facts
  Health-->>Agent: Structured Product Health data

  alt Tool result can be rendered directly
    Agent-->>User: Deterministic response
  else Model explanation is required
    Agent->>Model: Product Health facts
    Model-->>Agent: Explanation
    Agent-->>User: Final response
  end
```

For the complete service topology, including Caddy, Prometheus, Grafana, demo
services, and external model access, see
[Detailed service topology](docs/services.md#detailed-service-topology).

### Health propagation rules

Health propagation is deterministic:

- Severity is ordered as `DOWN > UNKNOWN > UP`.
- An item without dependencies uses its own signal state only.
- For an item with dependencies, its own `DOWN` state dominates. If its own state
  is `UP` or `UNKNOWN`, the item state is derived from dependencies: `DOWN` if
  any dependency is down, `UNKNOWN` if any dependency is unknown, and `UP` when
  all dependencies are up.

---

## Why so many technologies?

Partly because it is more interesting than a single-stack toy app, but also
because it mirrors a real company with history. Different teams know different
stacks, services appear at different times, and ownership boundaries outlive
framework choices. A useful platform should still work across those differences.

That is why the repository has a Java backend, a Go catalog service, a React UI,
Python demo automation, Java/Python/JavaScript dummy services, Prometheus,
Grafana, Caddy, Docker Compose, and shared QA tooling. The important boundary is
not the language. It is the contract between services.

---

## Run it locally

You need Docker or Podman with Compose support. From the repository root:

```shell
make up
```

Then open:

```text
http://localhost:3000
```

Stop the stack with:

```shell
make down
```

First startup can take a while because Compose builds local service images and
downloads Prometheus/Grafana/Caddy images. Full local-run options are in
[docs/running-locally.md](docs/running-locally.md).

### Optional AI agent configuration

The Python AI agent is disabled by default. To use the Bedrock provider, set
`AGENT_AI_ENABLED=true` and provide `AGENT_AI_CONFIG`.

For local development with a Bedrock API key, use `api_key`. This is a Bedrock
bearer token, not an AWS access key or secret key:

```shell
AGENT_AI_CONFIG={"provider":"bedrock","max_tool_rounds":2,"bedrock":{"model_id":"amazon.nova-lite-v1:0","aws_region":"eu-central-1","api_key":"<bedrock-api-key>"}}
```

For temporary local AWS credentials, use the explicit AWS credential fields:

```shell
AGENT_AI_CONFIG={"provider":"bedrock","max_tool_rounds":2,"bedrock":{"model_id":"amazon.nova-lite-v1:0","aws_region":"eu-central-1","aws_access_key_id":"<aws-access-key-id>","aws_secret_access_key":"<aws-secret-access-key>","aws_session_token":"<optional-session-token>"}}
```

For deployment on EC2, omit `api_key` and the explicit AWS credential fields so
boto3 uses its normal default credential chain, including the instance IAM role.

---

## Repository map

- [services-core/aggregator](services-core/aggregator): Java / Spring Boot
  backend. Loads catalog and signal definitions, polls health endpoints,
  propagates health through the dependency graph, exposes current Product Health
  facts, and exports derived metrics.
- [services-core/ai-agent](services-core/ai-agent): optional Python service that
  answers natural-language Product Health questions by calling the Product Health
  REST API and using a configured model provider.
- [services-core/catalog](services-core/catalog): Go service. Owns catalog
  files, JSON schemas, validation, and the catalog HTTP API.
- [services-core/aggregator-ui](services-core/aggregator-ui): React frontend
  served by Caddy.
- [services-extra/prometheus](services-extra/prometheus): metrics collection.
- [services-extra/grafana](services-extra/grafana): dashboards used by the UI.
- [services-demo/chaos-maker](services-demo/chaos-maker): Python service that
  changes demo-service state.
- [services-demo/dummy-java](services-demo/dummy-java),
  [services-demo/dummy-python](services-demo/dummy-python), and
  [services-demo/dummy-javascript](services-demo/dummy-javascript): simulated
  services with health endpoints.

More detail:

- [docs/services.md](docs/services.md) explains the service responsibilities,
  contracts, catalog files, and metrics.
- [docs/development.md](docs/development.md) covers formatting, linting, and git
  hooks.
- [deploy/demo/README.md](deploy/demo/README.md) covers the hosted demo stack.
