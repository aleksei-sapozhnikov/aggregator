# UI component boundaries

Group components by feature, not just by rendering mechanism.

- `item-details/`: selected Item health, ownership, and replaceable Timeline integration.
- `catalog-tree/`: catalog navigation and search.
- `ai-chat/`: optional standalone assistant UI.
- `src/app/`: application orchestration, workspace layout, and toolbar.
- `entity-details/`: entity detail dialogs (actor, contact, signal). They do
  not belong to the Details panel. `signal/useSignalDetails.ts` also owns
  signal deep-link state, so Grafana and the Item panel can open the same dialog.
- `about/`: application description, contextual help content, animation scenes,
  and the single contextual-help provider.
- `shared/ui/`: small reusable buttons, links, labels, and modal framing.
- `shared/item/`: presentation of an Item's title, ownership, health signals,
  and timeline, shared by the live panel and help scenes.
- `shared/help/`: generic help trigger, tooltip, and typed React context.
  These components never import an animation or a specific help topic.

## Dependency rules

Feature modules may depend on their own child components and on `shared/`.
They must not import the implementation details of a sibling feature.
`shared/` must not depend on any feature module. The entrypoint in `src/main.tsx` composes features,
including the `about/ContextualHelpProvider`.

The context provider owns registered help content and modal lifecycle.
`InfoHelp` only resolves a topic, shows its summary, and requests that it be
opened. Static topic text and its illustration are colocated in each
`about/<topic>/*HelpContent.tsx`. Dynamic contact-preview topics are built
inside `entity-details/contact/` and passed to the same generic context.

Keep tests next to the relevant source or at a feature integration boundary.
A focused dependency test (`ComponentBoundaries.test.ts`) verifies these
import directions without additional tooling. The architecture lives here;
individual folders need README files only when
their behavior or constraints warrant additional explanation.

The `src/shared/` directory outside `components/` contains data types and
non-visual helpers and is deliberately separate from reusable React UI.

## Timeline boundary

`ItemDetails` only uses `TimelineSection`, not Grafana-specific interfaces.
The section owns the adapter under `item-details/timeline/grafana/`.
`src/app/AppLayout.tsx` composes the toolbar and AI chat independently of Item details.
