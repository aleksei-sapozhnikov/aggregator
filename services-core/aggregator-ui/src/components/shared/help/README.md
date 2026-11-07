# Contextual help primitives

`HelpContext` defines a topic's title, summary, and optional React content.
`InfoHelp` resolves a topic and renders `HelpTooltip`; the provider in
`../../about/core/` owns which modal is currently open.

The short tooltip text and the first bold paragraph of each static help topic
come from the same `summary` field in its `*HelpContent.tsx`. This is
independent of catalog Item descriptions, which use their own metadata.

These primitives stay unaware of specific animations or business features.
`InfoHelpButton` can also be used in demonstrations without mounting a
real help dialog.
