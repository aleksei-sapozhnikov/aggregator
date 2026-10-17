# Optional assistant interface

`AiChatPanel.tsx` handles question submission, message history, cleared state,
and structured Product Health results from the optional AI agent.

The panel uses `src/services/aggregatorApi.ts` for requests. Health statuses
are server-provided facts; chat components only render them and link to Items.
The UI must continue to work when the agent is disabled or unavailable.

This module does not own global chat enablement, catalog routing, or health
aggregation. Those remain in the app orchestrator and Product Health service.
