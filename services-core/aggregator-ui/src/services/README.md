# HTTP adapters

`aggregatorApi.ts` is the HTTP boundary for catalog metadata, Product Health,
and optional AI-agent requests. It normalizes server payloads into the UI
contracts in `src/shared/types.ts`.

Required catalog records and optional contact/actor relationships are loaded
separately. Components consume typed results; they should not decode raw
server responses.

Health states are authoritative backend facts. The adapter may validate or
normalize wire values but must never infer or recalculate product health.
