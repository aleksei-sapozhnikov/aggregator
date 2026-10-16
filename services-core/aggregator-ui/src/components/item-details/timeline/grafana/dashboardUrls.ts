/** Grafana-specific dashboard configuration and wrapper URLs. */
import type { AggregatorUiRuntimeConfig } from "../../../../shared/types";
import { resolveBaseUrl } from "../../../../services/aggregatorApi";

export const DASHBOARDS = {
  timeline: {
    uid: "item-health-state",
    slug: "item-health-state",
    panelId: 3001,
  },
} as const;

export const GRAFANA_FRAME_WRAPPER_REV = "v2026-03-04";

const resolveTimelineDefaultRange = (): string => {
  const configured = (import.meta.env.VITE_TIMELINE_DEFAULT_RANGE ?? "").trim();
  if (!configured) {
    if (import.meta.env.MODE === "test") return "1d";
    throw new Error("VITE_TIMELINE_DEFAULT_RANGE is required");
  }
  return configured.startsWith("now-") ? configured.slice(4) : configured;
};

const TIMELINE_DEFAULT_RANGE = resolveTimelineDefaultRange();

export const resolveGrafanaBaseUrl = (): string => {
  const runtimeConfig = window.__AGGREGATOR_UI__ as
    | AggregatorUiRuntimeConfig
    | undefined;
  const configured = runtimeConfig?.grafanaUrl;
  if (configured) {
    return configured;
  }
  if (import.meta.env.VITE_GRAFANA_URL) {
    return import.meta.env.VITE_GRAFANA_URL;
  }
  return `${resolveBaseUrl()}grafana`;
};

const normalizeDashboardBaseUrl = (
  baseUrl: string,
  dashboardUid: string,
  dashboardSlug = dashboardUid,
): string => {
  const url = new URL(baseUrl, window.location.origin);
  const segments = url.pathname.split("/").filter(Boolean);
  const dashboardIndex = segments.findIndex(
    (segment) => segment === "d" || segment === "d-solo",
  );

  if (dashboardIndex !== -1 && segments[dashboardIndex + 1] === dashboardUid) {
    segments[dashboardIndex] = "d";
    if (segments[dashboardIndex + 2]) {
      segments.length = dashboardIndex + 3;
    } else {
      segments.length = dashboardIndex + 2;
      segments.push(dashboardSlug);
    }
  } else {
    segments.push("d", dashboardUid, dashboardSlug);
  }

  url.pathname = `/${segments.join("/")}`;
  url.search = "";
  url.hash = "";
  return url.toString().replace(/\/$/, "");
};

export const buildDashboardUrl = (
  baseUrl: string,
  dashboardUid: string,
  dashboardSlug: string,
  itemId: string,
  theme: "dark" | "light",
  panelId: string | number | null | undefined,
  appBaseUrl = "",
): string => {
  const params = new URLSearchParams({
    orgId: "1",
    "var-item_id": itemId,
    "var-app_base_url": appBaseUrl,
    theme,
    from: `now-${TIMELINE_DEFAULT_RANGE}`,
    to: "now",
  });
  if (panelId !== null && panelId !== undefined && panelId !== "") {
    params.set("viewPanel", String(panelId));
  }
  const normalizedBaseUrl = normalizeDashboardBaseUrl(
    baseUrl,
    dashboardUid,
    dashboardSlug,
  );
  return `${normalizedBaseUrl}?${params.toString()}&kiosk`;
};

export const buildGrafanaFrameUrl = ({
  initialTheme,
  grafanaUrl = "",
}: { initialTheme?: string; grafanaUrl?: string } = {}): string => {
  const frameUrl = new URL("components/item-details/timeline/grafana/frame/index.html", resolveBaseUrl());
  frameUrl.searchParams.set("rev", GRAFANA_FRAME_WRAPPER_REV);
  frameUrl.searchParams.set(
    "theme",
    initialTheme === "dark" ? "dark" : "light",
  );
  if (grafanaUrl) {
    frameUrl.searchParams.set("src", encodeURIComponent(grafanaUrl));
  }
  return frameUrl.toString();
};

