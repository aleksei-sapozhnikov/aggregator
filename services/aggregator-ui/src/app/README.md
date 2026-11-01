# Application composition

`App.tsx` connects data loading, Item routing, catalog navigation, and feature
views. It owns global dialog and panel state; feature hooks prepare their own
data and interactions. `AppLayout` and `AppToolbar` compose the workspace and
global controls without requesting catalog data.

Responsive sidebar gestures and viewport sizing belong to `useResponsiveLayout`.
`useTitlePlacement` measures the heading and toolbar to prevent overlap.

## Item routing

`hooks/useItemNavigation.ts` owns selected Item identity, dependency paths,
deep links, and browser history. Tree selections preserve the path because
one Item can occur in several branches. Links from AI chat and Grafana select
an Item without adding a branch path to the URL. Repeated selections must not
add duplicate history entries, and Back/Forward preserves unrelated expanded
branches.

The hook delegates expansion, scrolling, and mobile catalog dismissal through
callbacks. Catalog search and rendering stay in
[catalog-tree](../components/catalog-tree/README.md). Route helpers in
`shared/navigation/itemRoutes.ts` parse and build URLs; browser listeners and
history updates belong to the hook.

Signal dialogs use a separate `#signal/<id>` fragment, owned by
`components/entity-details/signal/useSignalDetails.ts`. Item route updates
preserve this fragment.

## Data and optional features

`useCatalogData` retries catalog initialization every 10 seconds until it
succeeds, with an 8-second timeout per attempt. Once a non-empty catalog is
available, it polls Product Health every 10 seconds with the same timeout and
no overlapping requests. It retains health data on failure and exposes
connectivity separately, following the [health contract](../../README.md#health-and-connectivity).
Initial Item selection belongs to `App` and `useItemNavigation`.

AI chat is temporarily enabled per browser by the flag documented in `App.tsx`.
The chat panel owns its conversation and request errors; catalog use does not
depend on the optional agent being available.
