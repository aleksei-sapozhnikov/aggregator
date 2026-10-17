# Aggregator UI

React and TypeScript frontend for Catalog Health Aggregator. The UI presents
catalog relationships, service-provided health, available contacts, and history.
The UI does not calculate product health. UP, DOWN, and UNKNOWN are backend
facts. UNKNOWN (yellow question mark) means Aggregator has insufficient health
information. A single failed or timed-out Product Health request marks the
**frontend connection** as DISCONNECTED. A gray banner shows when the failure
was detected and when the last successful snapshot was received. Previously
reported Item states and signals stay visible and are labeled Last known;
they are not recomputed, changed to DOWN or UNKNOWN, or counted as connection
failures. If no successful snapshot has been received, Item status indicators
remain hidden. A successful poll removes the banner and updates the snapshot.

Connection-loss detection time is the first failed poll, not necessarily the
exact moment the network stopped working. Per-signal observation timestamps
are not provided by the current backend API; the last-successful time records
when this browser received the entire health snapshot.

Catalog initialization retries after failure, while optional ownership/contact
endpoints have independent timeouts so that they cannot block required data.
Cyclic dependency groups remain visible as fallback catalog tree roots.

## Reading the code

- `src/main.tsx` mounts the application and global providers.
- `src/app/` orchestrates data, navigation, responsive layout, and Item details.
- `src/components/README.md` explains feature boundaries and reusable UI.
- `src/shared/README.md` documents domain contracts and pure helpers.
- `src/services/README.md` explains HTTP adapters and health-state ownership.
- `src/components/about/README.md` covers help topics and animated scenes.

Use concise JSDoc before named functions and React components. File headers
describe each module; folder README files document cross-file responsibilities
and constraints. Prefer descriptive names and TypeScript types to comments
inside implementations.

## Validation

From this directory: `npm run typecheck`, `npm test`, and `npm run build`.
Shared markup, CSS, and animation geometry also require desktop/mobile visual
checks when changed.
