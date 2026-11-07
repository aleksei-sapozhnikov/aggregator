# Selected Item view

`core/ItemDetails.tsx` renders ownership, primary contact, unhealthy and
healthy signals, and a Timeline for the selected Item.

`data/useSelectedItemData.ts` joins existing catalog Item, actors, contacts,
dependency paths, and server-reported health facts into presentation groups.
It may group and sort, but never infer or override Product Health.

`timeline/TimelineSection.tsx` is provider-independent. Grafana-specific
iframe initialization, URLs, theme messages, and Item-link interception live
under `timeline/grafana/`. The wrapper uses `postMessage` because Grafana
renders in a separate document.

The live view shares UI components with contextual-help animations via
`../shared/item/`. Changes to their markup need animation layout review.
