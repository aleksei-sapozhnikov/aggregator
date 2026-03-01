import yaml from 'js-yaml';

/**
 * @file Data access and URL-construction helpers for aggregator-ui.
 * Centralizes external integration details (catalog, Prometheus, Grafana).
 */

/**
 * Dashboard descriptors used by the UI when building Grafana URLs.
 */
export const DASHBOARDS = {
    timeline: {
        uid: 'item-health-state',
        slug: 'item-health-state',
        panelId: 3001,
    },
};

/**
 * Cache-bust revision for the dedicated Grafana wrapper page.
 * Bump when changing wrapper behavior (`grafana-frame/index.js` or `grafana-frame/index.html`).
 */
export const GRAFANA_FRAME_WRAPPER_REV = 'v2026-02-22';

/**
 * Reads and validates default Grafana time range from env.
 */
const resolveTimelineDefaultRange = () => {
    const configured = (import.meta.env.VITE_TIMELINE_DEFAULT_RANGE ?? '').trim();
    if (!configured) {
        throw new Error('VITE_TIMELINE_DEFAULT_RANGE is required');
    }
    return configured.startsWith('now-') ? configured.slice(4) : configured;
};

const TIMELINE_DEFAULT_RANGE = resolveTimelineDefaultRange();

/**
 * Resolves initial UI theme from localStorage or system preference.
 */
export const getInitialTheme = () => {
    const stored = localStorage.getItem('aggregator-ui-theme');
    if (stored) {
        return stored;
    }
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
};

/**
 * Resolves Vite base path as a pathname for route/url construction.
 */
export const resolveBasePath = () => {
    const baseUrl = import.meta.env.BASE_URL || '/';
    return new URL(baseUrl, window.location.origin).pathname;
};

/**
 * Resolves absolute application base URL.
 */
export const resolveBaseUrl = () => `${window.location.origin}${resolveBasePath()}`;

/**
 * Resolves Grafana base URL from runtime config, env, or local proxy fallback.
 */
export const resolveGrafanaBaseUrl = () => {
    const configured = window.__AGGREGATOR_UI__?.grafanaUrl;
    if (configured) {
        return configured;
    }
    if (import.meta.env.VITE_GRAFANA_URL) {
        return import.meta.env.VITE_GRAFANA_URL;
    }
    return `${resolveBaseUrl()}grafana`;
};

/**
 * Resolves Prometheus base URL from runtime config, env, or local proxy fallback.
 */
export const resolvePrometheusBaseUrl = () => {
    const configured = window.__AGGREGATOR_UI__?.prometheusUrl;
    if (configured) {
        return configured;
    }
    if (import.meta.env.VITE_PROMETHEUS_URL) {
        return import.meta.env.VITE_PROMETHEUS_URL;
    }
    return `${window.location.origin}/prometheus`;
};

/**
 * Resolves sidebar title from env configuration.
 */
export const resolveSidebarTitle = () => (import.meta.env.VITE_APP_TITLE ?? '').trim();

/**
 * Maps numeric Prometheus health value to UI status.
 */
export const parsePrometheusHealthStatus = (value) => {
    let status = 'unknown';
    if (Number.isFinite(value)) {
        if (value >= 0.9) {
            status = 'up';
        } else if (value <= 0.1) {
            status = 'down';
        }
    }
    return status;
};

/**
 * Sort comparator helper for statuses (down -> unknown -> up).
 */
export const compareHealthStatus = (left, right) => {
    const order = {down: 0, unknown: 1, up: 2};
    const leftRank = order[left] ?? 3;
    const rightRank = order[right] ?? 3;
    if (leftRank !== rightRank) {
        return leftRank - rightRank;
    }
    return 0;
};

/**
 * Normalizes Grafana dashboard base URL to `/d/:uid/:slug` form.
 */
const normalizeDashboardBaseUrl = (
    baseUrl,
    dashboardUid,
    dashboardSlug = dashboardUid,
) => {
    const url = new URL(baseUrl, window.location.origin);
    const segments = url.pathname.split('/').filter(Boolean);
    const dashboardIndex = segments.findIndex((segment) => segment === 'd' || segment === 'd-solo');

    if (dashboardIndex !== -1 && segments[dashboardIndex + 1] === dashboardUid) {
        segments[dashboardIndex] = 'd';
        if (segments[dashboardIndex + 2]) {
            segments.length = dashboardIndex + 3;
        } else {
            segments.length = dashboardIndex + 2;
            segments.push(dashboardSlug);
        }
    } else {
        segments.push('d', dashboardUid, dashboardSlug);
    }

    url.pathname = `/${segments.join('/')}`;
    url.search = '';
    url.hash = '';

    return url.toString().replace(/\/$/, '');
};

/**
 * Builds a Grafana dashboard URL for the selected item and theme.
 */
export const buildDashboardUrl = (
    baseUrl,
    dashboardUid,
    dashboardSlug,
    itemId,
    theme,
    panelId,
    appBaseUrl = '',
) => {
    const params = new URLSearchParams({
        orgId: '1',
        'var-item_id': itemId,
        'var-app_base_url': appBaseUrl,
        theme,
        from: `now-${TIMELINE_DEFAULT_RANGE}`,
        to: 'now',
    });
    if (panelId) {
        params.set('viewPanel', panelId);
    }
    const normalizedBaseUrl = normalizeDashboardBaseUrl(baseUrl, dashboardUid, dashboardSlug);
    return `${normalizedBaseUrl}?${params.toString()}&kiosk`;
};

/**
 * Builds URL for the dedicated Grafana wrapper page (iframe host).
 * The wrapper isolates keyboard/history behavior from the main app.
 */
export const buildGrafanaFrameUrl = ({initialTheme, grafanaUrl = ''} = {}) => {
    const frameUrl = new URL('grafana-frame/index.html', resolveBaseUrl());
    frameUrl.searchParams.set('rev', GRAFANA_FRAME_WRAPPER_REV);
    frameUrl.searchParams.set('theme', initialTheme === 'dark' ? 'dark' : 'light');
    if (grafanaUrl) {
        frameUrl.searchParams.set('src', encodeURIComponent(grafanaUrl));
    }
    return frameUrl.toString();
};

/**
 * Loads and parses the catalog definition.
 * Currently reads `catalog-definition.yaml`; later can be replaced with HTTP without UI changes.
 */
export const loadCatalog = async () => {
    const response = await fetch(new URL('catalog-definition.yaml', resolveBaseUrl()));
    if (!response.ok) {
        throw new Error(`Failed to load catalog: ${response.status}`);
    }
    const text = await response.text();
    const data = yaml.load(text) || {};
    return {
        items: Array.isArray(data.items) ? data.items : [],
        dependencies: Array.isArray(data.dependencies) ? data.dependencies : [],
    };
};

/**
 * Best-effort Prometheus polling:
 * parses item health and per-item health checks into UI-ready maps.
 * If one endpoint fails, successful data from the other endpoint is still returned.
 */
export const fetchPrometheusStatuses = async (prometheusBaseUrl) => {
    const [itemResponse, signalResponse] = await Promise.all([
        fetch(
            `${prometheusBaseUrl}/api/v1/query?query=${encodeURIComponent('catalog_item_state')}`,
        ),
        fetch(
            `${prometheusBaseUrl}/api/v1/query?query=${encodeURIComponent('catalog_item_signal_state')}`,
        ),
    ]);

    const nextStatuses = {};
    const nextItemSignals = {};

    if (itemResponse.ok) {
        const itemContentType = itemResponse.headers.get('content-type') || '';
        if (itemContentType.includes('application/json')) {
            const payload = await itemResponse.json();
            const results = payload?.data?.result ?? [];
            results.forEach((entry) => {
                const itemId = entry?.metric?.item_id;
                if (!itemId) {
                    return;
                }
                const value = Number.parseFloat(entry?.value?.[1]);
                nextStatuses[itemId] = parsePrometheusHealthStatus(value);
            });
        }
    }

    if (signalResponse.ok) {
        const signalContentType = signalResponse.headers.get('content-type') || '';
        if (signalContentType.includes('application/json')) {
            const payload = await signalResponse.json();
            const results = payload?.data?.result ?? [];
            results.forEach((entry) => {
                const itemId = entry?.metric?.item_id;
                const signalId = entry?.metric?.signal_id;
                const signalName = entry?.metric?.signal_name || signalId;
                if (!itemId) {
                    return;
                }
                const value = Number.parseFloat(entry?.value?.[1]);
                const status = parsePrometheusHealthStatus(value);
                if (signalId && signalName) {
                    const list = nextItemSignals[itemId] || [];
                    list.push({id: signalId, name: signalName, status});
                    nextItemSignals[itemId] = list;
                }
            });
        }
    }

    return {
        itemStatuses: nextStatuses,
        itemSignals: nextItemSignals,
    };
};
