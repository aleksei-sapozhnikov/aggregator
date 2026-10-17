# Application composition

`App.tsx` wires together data, routing, sidebar navigation, selected Item
presentation, and optional AI chat. It does not compute Product Health.

`AppLayout.tsx` owns workspace composition and heading placement;
`AppToolbar.tsx` renders global actions. Neither requests catalog data.

The hooks separate stateful concerns:

- `useCatalogData`: initial catalog loading and Product Health polling.
- `useItemNavigation`: selected Item and dependency path, deep links, history.
- `useResponsiveLayout`: mobile/desktop sidebar, gestures, visual viewport.
- `useTitlePlacement`: heading and action measurements to prevent overlap.

See `hooks/README.md` for route invariants. Navigation and UI state remain
separate from deterministic service-provided health.
