# Contextual help

Each static topic keeps its summary, explanation, and animation together in
`*HelpContent.tsx`. The summary supplies both the hover tooltip and the first
bold paragraph of the dialog, so the two stay consistent.

`core/ContextualHelpProvider.tsx` registers topics and owns the active dialog.
The generic context and controls in `components/shared/help/` resolve and open
topics without importing their content. Contact previews supply dynamic topics
through the same context. Catalog Item descriptions use separate catalog
metadata.

## Production UI in illustrations

Help scenes reuse [shared Item components](../shared/item/README.md) with
deterministic fixtures from `shared/demoData.ts`. Omit actionable callbacks,
disable catalog information, and keep the preview layer inert so example
controls cannot navigate or take focus. Scenario selection remains outside the
passive illustration.

`HelpScene` scales HTML and SVG together without `foreignObject`.
`useHelpTargets` measures rendered rows to align highlights and characters.
The selectors and geometry need visual review when shared markup changes.
`useHelpAnimationClock` provides a chosen static frame for reduced motion.

Healthy and unhealthy topics own their timing and propagation separately.
They share the graph and Item layout in `shared/signal-flow/`; the failing
dependency projection stays in `unhealthy-signals/`. Wave arrival and node
state changes must stay synchronized. Detailed holds and recovery timing are
documented beside `UnhealthySignalTiming.ts`.

## Illustrations and assets

Grafana owns the live chart, filters, time range, and popups in a separate
document. `timeline/GrafanaTimelineIllustration.tsx` uses an animated example
of those controls; the destination Item view still uses production components.

Shared characters and service illustrations use SVG layers with gestures
defined per role. Keep Vite's `?no-inline` imports: SVG `<use>` fragment
references need an emitted file rather than a data URL. Role captions are
separate scene elements.

For animation changes, run the UI service's typecheck, tests, and build, then
check desktop and mobile layouts, including reduced motion.
