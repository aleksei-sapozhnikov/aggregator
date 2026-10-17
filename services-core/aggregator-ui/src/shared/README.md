# Shared domain utilities

Shared catalog, health, and view-data contracts live here alongside helpers
for tree traversal, search, routes, contact presentation, and pointer events.
These utilities are used across feature components and HTTP adapters.

Health helpers format, classify, and sort reported states. They must not
calculate Product Health or turn a transport failure into a health value.

Reusable visual controls belong in `components/shared/`.
[Theme state](theme/README.md) lives here because it is shared by the whole
application, including its React provider and integrations such as Grafana.
