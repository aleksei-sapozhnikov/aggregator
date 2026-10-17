# Contextual help scenes

The Item UI in these scenes is the production UI, rendered with deterministic
fixtures from `shared/demoData.ts`:

- `ItemTitle` renders the item name, catalog information and health status.
- `ItemOwnership` renders the primary contact and actor rows.
- `HealthySignals` and `UnhealthySignals` render signal disclosures and rows.
- `ItemTimeline` renders the application's disclosure and Grafana container.
- `DetailsDisclosureHeader`, `InfoHelpButton`, `ModalDetailsTrigger`,
  `ItemNavigationLink` and `SecondaryLabel` supply the shared controls and labels.

`DetailsPanel` supplies real callbacks and help dialogs. Scenes omit action
callbacks and destinations, disable catalog information, and put the UI inside
an inert layer. The figure/image labels describe each walkthrough. Timeline
scenario buttons remain available outside the passive preview. Demo components
never mount `DetailsPanel`, fetch catalog data, or open application dialogs.

`HelpScene` scales HTML and SVG in the same coordinate space without
`foreignObject`. `useHelpTargets` measures actual DOM rows for sprite and
selection-frame destinations; layout changes in shared UI should not require
new hard-coded text coordinates. Animation CSS controls layout and effects;
application UI styling comes from `styles.css`.

## Deliberate illustration boundary

Grafana renders its chart, range display, signal selector and popups inside an
iframe. Those are not React components owned by this application. The existing
mock is isolated in `timeline/GrafanaTimelineIllustration.tsx` and its stylesheet;
the surrounding `ItemTimeline` and destination Item use production components.
No Grafana iframe or live requests are used in help.

Characters, machines, phones, dependency graphs, moving checkmarks, selection
frames and the simulated cursor are explanatory drawings and remain SVG/CSS.
They are not substitutes for application UI. The laptop/phone screens illustrate
devices rather than an additional Aggregator page.

Tests cover production interactions, shared markup reaching both contexts,
passive previews, animation phases and looping, resize measurements and static
frames for reduced motion. Run the UI service's `npm run typecheck`, `npm test`
and `npm run build` directly.
