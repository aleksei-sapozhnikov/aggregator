# Services and architecture

Detailed architecture views for Catalog Health Aggregator. Service locations and short descriptions are kept in the main README.

## Product Health data flow

This view shows how the deterministic Product Health state is built and exposed.
The aggregator combines catalog data with health signals, then publishes the
same state through REST for application consumers and as metrics for
observability.

```mermaid
flowchart LR
  catalog["Catalog"] --> aggregator["Aggregator"]
  signals["Health signals"] --> aggregator

  aggregator -->|REST API| consumers["Web UI / AI agent"]
  aggregator -->|Exported metrics| observability["Prometheus / Grafana"]
```

## AI-assisted investigation flow

This sequence shows how a user question moves through the optional AI path. The
model selects which Product Health data is needed, the agent retrieves the
deterministic facts, and the result is either rendered directly or sent back to
the model for explanation. The model does not calculate Product Health.

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

## Detailed service topology

This is the runtime topology of the demo stack. Caddy is the entry point, with
the Web UI, catalog, aggregator, and optional AI agent forming the core
application. Prometheus and Grafana provide observability, while the demo-only
services generate changing health states.

The catalog reads the file-backed definitions, the aggregator consumes the
catalog and polls service health, and the AI agent queries the aggregator and
optionally calls an external model provider.

```mermaid
flowchart TB
  browser["User Browser"] --> proxy["Caddy<br>reverse proxy"]

  subgraph core["Core application"]
    ui["aggregator-ui"]
    catalog["catalog"]
    aggregator["aggregator"]
    agent["ai-agent<br>optional"]
  end

  subgraph observability["Observability"]
    prometheus["Prometheus"]
    grafana["Grafana"]
  end

  subgraph demo["Demo only"]
    chaos["chaos-maker"]
    dummy["dummy services"]
  end

  files["Catalog files<br>YAML / JSON Schema"]
  model["Model Provider<br>Bedrock / ..."]

  proxy --> ui
  proxy --> catalog
  proxy --> aggregator
  proxy --> agent
  proxy --> grafana
  proxy --> prometheus

  catalog --> files
  aggregator --> catalog
  aggregator -. polls .-> dummy

  agent --> aggregator
  agent -. optional .-> model

  prometheus -. scrapes .-> aggregator
  grafana --> prometheus

  chaos --> catalog
  chaos -. changes state .-> dummy

  classDef optional stroke-dasharray: 5 5
  class agent,model,chaos,dummy optional
```
