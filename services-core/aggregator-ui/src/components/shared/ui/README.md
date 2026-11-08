# Shared UI controls

Shared buttons, links, labels, and modal framing keep common interactions
consistent. Callers choose the entity and action; these controls do not import
feature logic. Routable details use real links, while entities available only
in a modal use buttons.

`ModalWindow` owns focus containment, restoration, and stacking. Only the
topmost modal responds to Escape and backdrop clicks. Tab navigation and
programmatic focus must stay inside it; closing a child restores focus to its
trigger in the parent.

All body siblings of the topmost overlay become inert and hidden from assistive
technology. Their previous `inert` and `aria-hidden` attributes are restored
when the stack changes or closes.
