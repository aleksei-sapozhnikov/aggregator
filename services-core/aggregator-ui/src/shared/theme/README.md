# Application theme

`ThemeProvider`, mounted in `src/main.tsx`, keeps React consumers, the saved
`aggregator-ui-theme` preference, and `body[data-theme]` synchronized.
`theme.ts` defines the shared `Theme` type and uses the system preference when
no valid saved preference exists.

Use existing CSS custom properties for colors and `useTheme()` when a component
or integration needs the theme value. Keep document and preference updates in
the provider.

Grafana is a separate document and cannot access React context: `GrafanaFrame`
reads the global theme and communicates it to the wrapper through
`postMessage`. The wrapper applies the received theme to its own document.
