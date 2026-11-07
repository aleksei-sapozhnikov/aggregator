# Catalog navigation

`CatalogTree.tsx` presents a dependency tree and search results. It renders
service-reported statuses without computing health.

`useCatalogNavigation.ts` owns filtering, autocomplete, branch expansion,
and scroll targets. `useCatalogSelectionSync.ts` responds to Item selection
from elsewhere in the app; it restores the correct branch after search and
scrolls to the selected node.

The same Item can occur under different dependency paths. Keep path-aware
navigation and browser history in `src/app/hooks/useItemNavigation.ts`; the
tree must not invent new Item health states.
