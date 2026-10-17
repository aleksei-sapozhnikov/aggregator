# HTTP adapters

`aggregatorApi.ts` is the HTTP boundary for catalog metadata, Product Health,
and optional AI-agent requests. It normalizes server payloads into the UI
contracts in `src/shared/types.ts`.

Required catalog records and optional contact/actor relationships are loaded
separately. Components consume typed results; they should not decode raw
server responses.

Health states are authoritative backend facts. The adapter may validate or
normalize wire values but must never infer or recalculate product health.
Transport connectivity is tracked by useCatalogData, not encoded as a Product
Health value; DISCONNECTED refers to the entire UI-to-Aggregator request.
The UI preserves the last successful snapshot during a request outage.

Optional catalog endpoints are best-effort and have a 3-second timeout each.
Required requests honor catalog loading cancellation; the UI retries failed
initial catalog loads every 10 seconds. A missing Product Health response is
presented as UI-only DISCONNECTED, distinct from backend UNKNOWN.
