# Shared Item presentation

These React components are reused by the real selected Item view and by
contextual-help animations. Keep their markup consistent so examples mirror
the production UI.

- `ItemTitle`: Item name, status, and catalog descriptions.
- `ItemOwnership`: primary contact and actor roles.
- `ItemSignals`: reported signals, grouped by healthy/unhealthy state.
- `ItemTimeline`: provider-independent disclosure for history.
- `DetailsDisclosureHeader`: accessible expansion and pointer safeguards.
- `CatalogItemInfo`: short tooltip and longer modal description.

Components render facts passed by their callers; they never derive Product
Health. Layout changes must be checked against the positioning of animation
highlights in `../../about/`.
