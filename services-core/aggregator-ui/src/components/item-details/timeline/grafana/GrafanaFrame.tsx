import { useCallback, useEffect, useMemo, useRef } from "react";
import {
  buildDashboardUrl,
  buildGrafanaFrameUrl,
  DASHBOARDS,
  resolveGrafanaBaseUrl,
} from "./dashboardUrls";
import { resolveBaseUrl } from "../../../../services/aggregatorApi";
import { useTheme } from "../../../../shared/theme/ThemeProvider";

type GrafanaFrameProps = {
  itemId: string;
  onNavigateToItem: (itemId: string, href: string) => void;
};

/** Owns the Grafana iframe lifecycle and all communication with its wrapper. */
export default function GrafanaFrame({
  itemId,
  onNavigateToItem,
}: GrafanaFrameProps) {
  const { theme } = useTheme();
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const isReadyRef = useRef(false);
  const initialThemeRef = useRef(theme);
  const grafanaBaseUrl = useMemo(resolveGrafanaBaseUrl, []);
  const appBaseUrl = useMemo(() => resolveBaseUrl().replace(/\/$/, ""), []);
  const frameUrl = useMemo(
    () => buildGrafanaFrameUrl({ initialTheme: initialThemeRef.current }),
    [],
  );
  const dashboardUrl = useMemo(
    () =>
      buildDashboardUrl(
        grafanaBaseUrl,
        DASHBOARDS.timeline.uid,
        DASHBOARDS.timeline.slug,
        itemId,
        theme,
        DASHBOARDS.timeline.panelId,
        appBaseUrl,
      ),
    [grafanaBaseUrl, itemId, theme, appBaseUrl],
  );
  const pendingUrlRef = useRef(dashboardUrl);
  pendingUrlRef.current = dashboardUrl;

  const sendMessage = useCallback((message: Record<string, string>) => {
    iframeRef.current?.contentWindow?.postMessage(
      message,
      window.location.origin,
    );
  }, []);

  const handleLoad = useCallback(() => {
    isReadyRef.current = true;
    sendMessage({ type: "set-frame-theme", theme });
    sendMessage({ type: "set-grafana-src", src: pendingUrlRef.current });
  }, [sendMessage, theme]);

  useEffect(() => {
    if (!isReadyRef.current) return;
    sendMessage({ type: "set-frame-theme", theme });
    sendMessage({ type: "set-grafana-src", src: dashboardUrl });
  }, [dashboardUrl, theme, sendMessage]);

  useEffect(() => {
    const handleItemNavigation = (event: MessageEvent) => {
      if (
        event.origin !== window.location.origin ||
        event.source !== iframeRef.current?.contentWindow ||
        event.data?.type !== "grafana-item-link-click"
      )
        return;
      const linkedItemId =
        typeof event.data.itemId === "string" ? event.data.itemId : "";
      if (!linkedItemId) return;
      const href = typeof event.data.href === "string" ? event.data.href : "";
      onNavigateToItem(linkedItemId, href);
    };
    window.addEventListener("message", handleItemNavigation);
    return () => window.removeEventListener("message", handleItemNavigation);
  }, [onNavigateToItem]);

  return (
    <iframe
      title="State Timeline"
      ref={iframeRef}
      onLoad={handleLoad}
      src={frameUrl}
    />
  );
}
