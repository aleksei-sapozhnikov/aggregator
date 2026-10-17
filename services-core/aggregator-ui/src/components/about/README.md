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

The Unhealthy walkthrough uses a compact sequence: the fully red diagram is
held for 250 ms, the expanded Item is held for 2 seconds, and green recovery
waves propagate upward as fast as the preceding red failure waves. Arrival
times determine when dependent nodes change state.

## Healthy and unhealthy help

`healthy-signals/` and `unhealthy-signals/` expose separate help topics.
Each has its own animation timing and propagation logic. Both use the shared
`shared/signal-flow/SignalFlowHelpScene.tsx` layout and
`shared/signal-flow/SignalFlowGraph.tsx` drawing; only shared display props
cross that boundary. The failing-dependency projection lives in
`unhealthy-signals/` and is never imported by a shared component.
The graph uses explanatory SVG; the signals and ownership on the destination
Item use production React components.

## Deliberate illustration boundary

Grafana owns the chart, time range, signal filter, and hover popups inside an
iframe. Therefore `timeline/GrafanaTimelineIllustration.tsx` is a static
demonstration, while Item details on the simulated destination page use production
components. The chart itself is displayed without an extra Timeline
disclosure header.

Characters, machines, phones, dependency diagrams, moving checkmarks,
selection frames, and simulated cursors are explanatory SVG/CSS illustrations
and do not replace the application UI.

Illustrations are organized by role in `about/shared/characters/{owner,user,support}/`.
Each role owns a standalone SVG with named base and animated layers, its own
React renderer and gesture CSS. The generic `characters/shared/CharacterLayer`
composes SVG layers without choosing a role or inheriting character drawings.
Sprite imports use Vite's `?no-inline` option because SVG `<use>` fragment
references require a separately emitted file, not a small inlined data URL.
User waves a phone, Owner carries the repair wrench, and Support adjusts a
call-center headset. The same assets are reused in Actors and Primary contact. The service
machine has one SVG with an `unhealthy` parameter that switches its lamp
between green and red. Wooden captions are used for people only and remain
separate `DemoWoodLabel` elements, rather than becoming part of the SVG
assets. The service illustration needs no caption.

Primary Contact centers the expanded Aggregator page independently from the
SVG scene. Its Service, User with phone, and incoming Owner are distributed
across the canvas, and the scene scales down as a unit on narrow screens so
the figures and the outgoing phone waves remain inside the frame.

Use the UI service's `npm run typecheck`, `npm test`, and `npm run build`
for validation, plus browser checks at desktop and mobile widths.
