/** The application's single theme type and persistence policy. */
export type Theme = "dark" | "light";

export const THEME_STORAGE_KEY = "aggregator-ui-theme";

export function getInitialTheme(): Theme {
  const stored = localStorage.getItem(THEME_STORAGE_KEY);
  if (stored === "dark" || stored === "light") return stored;
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

export const nextTheme = (theme: Theme): Theme =>
  theme === "dark" ? "light" : "dark";
