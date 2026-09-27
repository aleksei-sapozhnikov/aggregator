# Services and architecture

Detailed architecture views for Catalog Health Aggregator. Service locations and short descriptions are kept in the main README.

## Product Health data flow

This view shows how the deterministic Product Health state is built and exposed.
The `aggregator` combines catalog data with health signals, then publishes the
same state through REST and exported metrics. The `aggregator-ui` uses the REST
API to provide the user-facing interface, while the optional `ai-agent` uses the
same API for Product Health questions.

```mermaid
flowchart LR
  catalog["catalog"] --> aggregator["aggregator"]
  signals["Health signals"] --> aggregator

  aggregator -->|REST API| consumers["aggregator-ui / ai-agent"]
  aggregator -->|Exported metrics| history["Prometheus / Grafana"]
```

## AI-assisted investigation flow

This sequence shows how a user question moves through the optional AI path.
The `aggregator-ui` sends the question to `ai-agent`, the model selects which
Product Health data is needed, and `ai-agent` retrieves the deterministic facts
from `aggregator`. The result is either rendered directly or sent back to the
model for explanation. The model does not calculate Product Health.

```mermaid
sequenceDiagram
  actor User
  participant UI as aggregator-ui
  participant Agent as ai-agent
  participant Model as Model Provider
  participant Aggregator as aggregator

  User->>UI: Natural-language question
  UI->>Agent: Question
  Agent->>Model: Question + tool definitions
  Model-->>Agent: Tool call
  Agent->>Aggregator: Query Product Health facts
  Aggregator-->>Agent: Structured Product Health data

  alt Tool result can be rendered directly
    Agent-->>UI: Deterministic response
  else Model explanation is required
    Agent->>Model: Product Health facts
    Model-->>Agent: Explanation
    Agent-->>UI: Final response
  end

  UI-->>User: Display response
```

## Detailed service topology

This is the runtime topology of the demo stack. Caddy is the entry point.
`aggregator-ui` provides the user-facing web interface, `catalog` serves the
file-backed catalog definitions, `aggregator` calculates Product Health, and the
optional `ai-agent` handles natural-language Product Health questions.

Prometheus stores Product Health metric history and Grafana visualizes that
history in dashboards embedded by `aggregator-ui`. The demo-only
`chaos-maker` changes the state of the dummy services so the demo continuously
produces changing health data.

```mermaid
flowchart TB
  browser["User Browser"] --> proxy["Caddy<br>reverse proxy"]

  subgraph core["Core application"]
    ui["aggregator-ui"]
    catalog["catalog"]
    aggregator["aggregator"]
    agent["ai-agent<br>optional"]
  end

  subgraph history["Health history"]
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
