# Application theme

The active theme is global UI state. `ThemeProvider` is mounted once in
`src/main.tsx`; it owns the `Theme` union (`light | dark`), preference
persistence in `aggregator-ui-theme`, and the `body[data-theme]` attribute.

Prefer existing CSS custom properties for theme-dependent colors. Components
should not inspect or manage `body[data-theme]` themselves or duplicate the
light/dark union. When a non-CSS integration needs the current theme (for
example, the theme switch or the Grafana iframe), call `useTheme()`.
Do not pass `theme` through components that do not consume it.

Grafana is a separate document and cannot access React context: `GrafanaFrame`
reads the global theme and communicates it to the wrapper through
`postMessage`. The wrapper applies the received theme to its own document.
