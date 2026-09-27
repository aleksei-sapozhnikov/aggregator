# Services and architecture

Detailed architecture views for Catalog Health Aggregator. Service locations and short descriptions are kept in the main README.

## Product Health data flow

```mermaid
flowchart LR
  catalog["Catalog"] --> aggregator["Aggregator"]
  signals["Health signals"] --> aggregator

  aggregator -->|REST API| consumers["Web UI / AI agent"]
  aggregator -->|Exported metrics| observability["Prometheus / Grafana"]
```

Both the REST API and exported metrics are derived from the same deterministic
Product Health state.

## AI-assisted investigation flow

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

The AI assistant can render structured tool results directly or use the model
again when an explanation is needed. It does not calculate Product Health.

## Detailed service topology

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
