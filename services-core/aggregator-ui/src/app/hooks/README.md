# Application routing

`useItemNavigation.ts` is the boundary for selected Item identity,
explicit dependency-tree paths, browser history, deep links, and Item navigation
requested by the catalog, dependencies, Grafana Timeline, or AI chat.

It owns `selectedId` and `selectedPath`, and delegates catalog-specific
effects (expand ancestors, highlight/scroll to a node, close the mobile
catalog) to callbacks supplied by the application. Tree search, presentation,
health calculation, and mobile gestures remain outside this hook.

The existing `shared/navigation/itemRoutes.ts` provides pure URL and
catalog-route helper functions. Route actions and browser listeners belong
in this hook; no feature component should manipulate Item routing directly.

The signal details fragment (`#signal/<id>`) is separately owned by
`components/entity-details/signal/useSignalDetails.ts` and must remain
compatible with Item route updates.

Initial catalog requests retry every 10 seconds after failure, while each
attempt has an 8-second timeout. Product Health polls every 10 seconds;
failure displays UI-only DISCONNECTED for catalog items instead of reusing
stale backend UP/DOWN/UNKNOWN states.
