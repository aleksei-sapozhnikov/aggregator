# Contextual help

`ContextualHelpProvider.tsx` registers each topic's title, short hover summary,
and full React content. `ContextualHelpDialog.tsx` displays the selected
content in the common modal. Each static topic keeps its explanatory text and
animation together inside its own `*HelpContent.tsx` next to the demo.

The live Item UI and help animations share presentation components from
`components/shared/item/`; they use independent, deterministic demo records
from `about/shared/demoData.ts`. Help scenes omit actionable callbacks,
disable catalog information, and render the UI in an inert layer.

`about/shared/HelpScene.tsx` scales HTML and SVG into a common coordinate
space without `foreignObject`. The `useHelpTargets` hook measures rendered
Item rows to align highlights and illustrated characters with the real UI.
CSS selectors and animation geometry still require visual regression review
when the shared markup changes.

## Healthy and unhealthy help

`healthy-signals/` and `unhealthy-signals/` expose separate help topics.
They currently share the graph/scene mechanics in
`shared/signal-flow/SignalFlowHelpScene.tsx`, configured by scenario mode.
The failing-dependency projection lives only in `unhealthy-signals/`.
The shared graph uses explanatory SVG; the signals and ownership on the
destination Item use production React components.

## Deliberate illustration boundary

Grafana owns the chart, time range, signal filter, and hover popups inside an
iframe. Therefore `timeline/GrafanaTimelineIllustration.tsx` is a static
demonstration, while its surrounding `ItemTimeline` wrapper and Item details
are the production components.

Characters, machines, phones, dependency diagrams, moving checkmarks,
selection frames, and simulated cursors are explanatory SVG/CSS illustrations
and do not replace the application UI.

Use the UI service's `npm run typecheck`, `npm test`, and `npm run build`
for validation, plus browser checks at desktop and mobile widths.
