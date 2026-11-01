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

The catalog tree and item headers use these health indicators:

- ![Green check mark](docs/assets/status-up.svg) **UP** - Working normally.
- ![Red cross](docs/assets/status-down.svg) **DOWN** - This item or a service it needs has a problem.
- ![Yellow question mark](docs/assets/status-unknown.svg) **UNKNOWN** - Aggregator is reachable, but it does not have enough information to determine health.
  Product Health states above are computed by Aggregator, not by the browser.
  When the UI loses its connection to Aggregator, it shows a gray
  **⊘ DISCONNECTED** banner with the last successful update and the detected
  connection-loss time. Previous Product Health states and signals remain
  visible as **Last known** rather than being changed to UNKNOWN or DOWN.
  If the UI has never received a successful health response, no Item health
  states are displayed until one arrives.

What to look at:

- The dependency tree on the left shows the current health of products,
  services, and shared components.
- Select any item to inspect its health signals and dependencies, see who owns
  it, and find the available contact channels.
- The `Unhealthy signals` section shows affected checks on the item and its
  dependencies, helping you trace where a problem comes from.
- Select an affected dependency to jump directly to its details, even when it
  is several levels below the product in the dependency tree.
- The `Timeline` shows health history, including dependency impact. Change the
  time range or filter checks to explore what happened.
- Use the help buttons beside section titles for short explanations and
  animated examples.

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
relationships, computes health deterministically, and exposes that state
through the UI, dashboards, and an optional AI assistant.

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

The LLM is not part of health calculation. Health state is derived from
catalog relationships and service signals before any AI interaction happens.

For detailed data flow, AI interaction, and runtime service topology, see
[Services and architecture](docs/services.md).

### Health propagation rules

Health propagation is deterministic:

- Severity is ordered as `DOWN > UNKNOWN > UP`.
- An item without dependencies uses its own signal state only.
- For an item with dependencies, its own `DOWN` state dominates. If its own state
  is `UP` or `UNKNOWN`, the item state is derived from dependencies: `DOWN` if
  any dependency is down, `UNKNOWN` if any dependency is unknown, and `UP` when
  all dependencies are up.

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

Local Docker Compose environments enable the Bedrock AI agent with
non-secret defaults from `deploy/compose/compose.overlay.local-ports.yaml`.
Other developers can override `AGENT_AI_CONFIG` from their shell and provide
temporary credentials from their own AWS profile, with access to their chosen
Bedrock model. The project `aggregator-admin` profile is not required.
The current AI agent implements the Bedrock provider only.
The base Compose stack leaves AI disabled unless configured.

For the PowerShell login, credential refresh, and security notes, see
[docs/running-locally.md](docs/running-locally.md#optional-ai-agent).

For deployment on EC2, omit `api_key` and explicit AWS credentials so boto3
uses the instance IAM role.

---

## Module documentation

The main services each document their role, integration boundary, and
developer entrypoints:

- [Health aggregator](services/aggregator/README.md): Java service that
  calculates and exposes deterministic Product Health.
- [Catalog](services/catalog/README.md): Go service owning catalog records
  and HTTP signal definitions.
- [Web UI](services/aggregator-ui/README.md): React interface, navigation,
  connection states, and optional chat.
- [AI agent](services/ai-agent/README.md): optional natural-language access
  to health facts, backed by AWS Bedrock.
- [Prometheus](services/prometheus/README.md) and
  [Grafana](services/grafana/README.md): historical metrics and visualization.
- [Chaos maker](services/chaos-maker/README.md) and the
  [Java](services/dummy-java/README.md),
  [Python](services/dummy-python/README.md), and
  [JavaScript](services/dummy-javascript/README.md) dummy services:
  demonstration failures and recovery.

For architecture and operations:

- [Architecture and data flow](docs/services.md)
- [Development and checks](docs/development.md)
- [Local Compose environments](deploy/compose/README.md)
- [Hosted demo and release workflow](environments/demo/README.md)
- [K3s GitOps deployment](deploy/kubernetes/README.md)
- [Project infrastructure ownership](environments/shared/README.md)
- [Publication automation](tools/publisher/README.md)
- [Code QA](tools/code_qa/README.md)
