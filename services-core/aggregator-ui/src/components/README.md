# UI component boundaries

Group components by feature, not just by rendering mechanism.

- `details/`: selected Item panel, header actions, and embedded AI chat.
- `sidebar/`: catalog and dependency navigation.
- `entity-details/`: entity detail dialogs (actor, contact, signal). They do
  not belong to the Details panel, even if that panel opens them.
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
`shared/` must not depend on `about/`, `details/`, `sidebar/`,
or `entity-details/`. The entrypoint in `src/main.tsx` composes features,
including the `about/ContextualHelpProvider`.

The context provider owns registered help content and modal lifecycle.
`InfoHelp` only resolves a topic, shows its summary, and requests that it be
opened. Static topic text and its illustration are colocated in each
`about/<topic>/*HelpContent.tsx`. Dynamic contact-preview topics are built
inside `entity-details/contact/` and passed to the same generic context.

Keep tests next to the relevant source or at a feature integration boundary.
The architecture lives here; individual folders need README files only when
their behavior or constraints warrant additional explanation.

The `src/shared/` directory outside `components/` contains data types and
non-visual helpers and is deliberately separate from reusable React UI.
