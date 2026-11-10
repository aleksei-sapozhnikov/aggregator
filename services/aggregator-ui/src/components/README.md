# UI component boundaries

Feature components own catalog browsing, selected Item details, entity dialogs,
assistant conversation, and contextual help. The application in `src/app/`
connects these features and supplies navigation and shared data.

Features may import their own modules and `components/shared/`, but not sibling
feature implementations. Shared components must not import features.
`ComponentBoundaries.test.ts` checks these directions, including separation of
help topics and the Grafana integration.

Entity dialogs are independent of the selected Item panel so different entry
points can open the same details. Generic help controls use a context defined
in `shared/help/`; the provider and registered topics belong to `about/`.
Reusable Item components serve both the live view and help scenes.

Keep detailed constraints with the feature that owns them:

- [Catalog navigation](catalog-tree/README.md): search, expansion, and selection synchronization.
- [Selected Item view](item-details/README.md): presentation data and the Timeline boundary.
- [Entity details](entity-details/README.md): dialogs, signal fragments, and contact previews.
- [Contextual help](about/README.md): topic registration and animation constraints.
- [Shared Item presentation](shared/item/README.md) and [modal controls](shared/ui/README.md): reuse and accessibility.

Data contracts, non-visual helpers, and global theme state live in
[`src/shared/`](../shared/README.md).
