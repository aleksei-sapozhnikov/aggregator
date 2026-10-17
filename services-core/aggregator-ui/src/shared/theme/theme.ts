/** @file Defines supported UI themes and persistence keys. */

/** The application's single theme type and persistence policy. */
export type Theme = "dark" | "light";

export const THEME_STORAGE_KEY = "aggregator-ui-theme";

/** Provides get initial theme for UI consumers. */
export function getInitialTheme(): Theme {
  const stored = localStorage.getItem(THEME_STORAGE_KEY);
  if (stored === "dark" || stored === "light") return stored;
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

/** Provides next theme for UI consumers. */
export const nextTheme = (theme: Theme): Theme =>
  theme === "dark" ? "light" : "dark";
