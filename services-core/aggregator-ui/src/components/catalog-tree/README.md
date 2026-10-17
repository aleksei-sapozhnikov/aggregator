# Catalog navigation

The catalog combines a dependency tree with search and autocomplete.
`useCatalogNavigation` owns search, branch expansion, and scroll targets;
`CatalogTree` presents that state and the reported health indicators.

An Item can occur in several branches. Selection and links need the occurrence's
path, not just its Item ID. Browser routes belong to
[`useItemNavigation`](../../app/README.md#item-routing).

`useCatalogSelectionSync` connects selection to tree effects after navigation
or clearing search. Keeping this integration separate lets the routing and
catalog hooks share state through the app without importing each other.
Scrolling waits for the selected row to be rendered and measurable.

Tree construction in `src/shared/catalog/tree.ts` stops cycles along each
path and adds fallback roots for otherwise unreachable Items, keeping cyclic
catalog groups visible.
