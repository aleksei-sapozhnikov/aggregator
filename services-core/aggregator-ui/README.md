# Aggregator UI

React and TypeScript frontend for Catalog Health Aggregator. The UI presents
catalog relationships, service-provided health, available contacts, and history.
It never calculates product health: UP, DOWN, and UNKNOWN are backend facts.

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
