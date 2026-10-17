# Shared domain utilities

This directory contains data types and ordinary TypeScript helpers, not React components.

- `catalog/tree.ts`: tree construction and tree navigation.
- `catalog/search.ts`: search normalization, filtering, ranking and autocomplete.
- `navigation/itemRoutes.ts`: browser route parsing and Item link generation.
- `contacts/contactPresentation.ts`: contact labels, icons, and primary-first sorting.
- `health/healthPresentation.ts`: presentation-only health helpers and status text.
- `ui/pointerUtils.ts`: generic pointer-event rules.
- `types.ts`: data contracts shared by UI and service adapters.

Never calculate or infer Product Health in UI helper functions. Health states
are supplied by the Product Health service; presentation helpers only format
or classify these facts. React implementations belong in `components/`.
