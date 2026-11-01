# Aggregator UI

React / TypeScript interface for understanding Product Health without having
to navigate service-level monitoring first. It presents the catalog and
dependency tree, failing and passing signals, affected dependencies, ownership
and contact details, and a Grafana-backed Timeline. Contextual help explains
the key concepts; an optional AI chat can answer Product Health questions.

The UI **does not calculate health**. `UP`, `DOWN`, and `UNKNOWN`
come from the aggregator API.

## Run and develop

The supported full environment is the repository-root `make up` (UI at
`http://localhost:3000`). For standalone frontend development, use Node
20.19+ or 22.12+:

```sh
cd services/aggregator-ui
npm ci
npm run dev
```

The Vite development server listens on port 3000. Catalog, Product Health,
Grafana and optional AI routes must be reachable via the development proxy;
use the full Compose stack if you do not have those services running.
For runtime configuration and exposed local ports, see
[Running locally](../../docs/running-locally.md).

Useful checks from this directory:

```sh
npm run typecheck
npm test
npm run build
```

The same built UI image is used across environments. At startup,
`APP_TITLE` and `TIMELINE_DEFAULT_RANGE` are written into public
`/config.json`; they are not secret settings.

## Health and connection behavior

A failed or timed-out Product Health request marks the **connection**
DISCONNECTED, not the Item health UNKNOWN or DOWN. The UI retains the
last successful facts and marks them **Last known**, showing when the
last snapshot succeeded and when the first polling failure was detected.
Before any successful snapshot, it hides Item status indicators.

An Item can appear in multiple dependency branches. Navigation preserves
the selected path while item ID links remain shareable. Grafana navigation
and dialogs are integrated without asking the frontend to recompute status.
For the internal boundaries, see
[application composition](src/app/README.md),
[feature components](src/components/README.md),
[shared contracts](src/shared/README.md), and
[HTTP adapters](src/services/README.md).

AI chat is still a browser-level demo feature. To enable it, set
`localStorage.setItem("aggregator-ui-ai-chat-enabled", "true")` in
the browser console and reload. This changes the UI only; the
[agent](../ai-agent/README.md) still needs a working backend and model.
