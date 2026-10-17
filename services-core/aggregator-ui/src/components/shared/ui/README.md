# Shared UI primitives

These components provide consistent controls without importing feature logic.

- `ModalWindow` owns modal focus, backdrop, Escape handling, and stacking.
- `CloseButton` and `ModalDetailsTrigger` provide common actions.
- `ItemNavigationLink` and `SecondaryLabel` display navigation and context.

Feature components decide which record to open and which action to perform.
These primitives must not depend on catalog search, health aggregation, or
specific help animations.
