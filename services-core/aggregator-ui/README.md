# Aggregator UI

React and TypeScript frontend for exploring catalog relationships, reported
Product Health, contacts, and history.

## Health and connectivity

Aggregator computes Product Health. UP, DOWN, and UNKNOWN are backend facts;
UNKNOWN means the backend has insufficient health information.

A failed or timed-out Product Health request marks the **frontend connection**
as DISCONNECTED. The UI retains the last successful statuses and signals,
labels them **Last known**, and shows a banner with the last successful fetch
and first detected failure. It never converts a connection failure into an
Item health state. Before the first successful snapshot, status indicators
remain hidden. A successful poll replaces the snapshot and clears the banner.

Connection-loss detection time is the first failed poll, not necessarily the
exact moment the network stopped working. Per-signal observation timestamps
are not provided by the current backend API; the last-successful time records
when this browser received the entire health snapshot.

## Code and documentation

- [Application composition](src/app/README.md): data loading, routing, and layout.
- [Component boundaries](src/components/README.md): features and reusable UI.
- [Shared utilities](src/shared/README.md): data contracts and common helpers.
- [HTTP adapters](src/services/README.md): request and payload handling.

Every TypeScript and TSX source file, including tests, must have a meaningful
`@file` JSDoc header explaining its purpose and responsibility. README files
explain module responsibilities and important decisions. Function-level
comments and JSDoc are useful for non-obvious behavior, constraints, or
reasoning; they are not required on every function or component. Prefer names
and types over comments that repeat the code.

## Validation

From this directory: `npm run typecheck`, `npm test`, and `npm run build`.
Shared markup, CSS, and animation geometry also require desktop/mobile visual
checks when changed. For stack setup, see
[Running locally](../../docs/running-locally.md).
