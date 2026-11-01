/** @file Loads public UI settings before rendering the React application. */

import type { AggregatorUiRuntimeConfig } from "./types";

export const loadRuntimeConfig = async (): Promise<void> => {
  const base = new URL(import.meta.env.BASE_URL || "/", window.location.origin);
  const response = await fetch(new URL("config.json", base), {
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(`Failed to load UI configuration: ${response.status}`);
  }
  const config = (await response.json()) as Partial<AggregatorUiRuntimeConfig>;
  if (
    !config ||
    typeof config.appTitle !== "string" ||
    typeof config.timelineDefaultRange !== "string" ||
    !config.timelineDefaultRange.trim()
  ) {
    throw new Error("Invalid UI runtime configuration");
  }
  window.__AGGREGATOR_UI__ = {
    ...window.__AGGREGATOR_UI__,
    appTitle: config.appTitle,
    timelineDefaultRange: config.timelineDefaultRange,
  };
  document.title = config.appTitle.trim() || "Health Aggregator";
};
