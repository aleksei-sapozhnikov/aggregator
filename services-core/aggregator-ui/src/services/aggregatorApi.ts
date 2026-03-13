import yaml from 'js-yaml';
import type {
    AggregatorUiRuntimeConfig,
    CatalogContact,
    CatalogDependency,
    CatalogItemContact,
    CatalogItem,
    HealthStatus,
    ItemSignal,
} from '../shared/types';

interface PrometheusMetricLabels {
    item_id?: string;
    signal_id?: string;
    signal_name?: string;
}

interface PrometheusVectorEntry {
    metric?: PrometheusMetricLabels;
    value?: [number | string, string];
}

interface PrometheusQueryPayload {
    data?: {
        result?: PrometheusVectorEntry[];
    };
}

export const DASHBOARDS = {
    timeline: {
        uid: 'item-health-state',
        slug: 'item-health-state',
        panelId: 3001,
    },
} as const;

export const GRAFANA_FRAME_WRAPPER_REV = 'v2026-03-04';

const resolveTimelineDefaultRange = (): string => {
    const configured = (import.meta.env.VITE_TIMELINE_DEFAULT_RANGE ?? '').trim();
    if (!configured) {
        throw new Error('VITE_TIMELINE_DEFAULT_RANGE is required');
    }
    return configured.startsWith('now-') ? configured.slice(4) : configured;
};

const TIMELINE_DEFAULT_RANGE = resolveTimelineDefaultRange();

export const getInitialTheme = (): 'dark' | 'light' => {
    const stored = localStorage.getItem('aggregator-ui-theme');
    if (stored === 'dark' || stored === 'light') {
        return stored;
    }
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
};

export const resolveBasePath = (): string => {
    const baseUrl = import.meta.env.BASE_URL || '/';
    return new URL(baseUrl, window.location.origin).pathname;
};

export const resolveBaseUrl = (): string => `${window.location.origin}${resolveBasePath()}`;

export const resolveGrafanaBaseUrl = (): string => {
    const runtimeConfig = window.__AGGREGATOR_UI__ as AggregatorUiRuntimeConfig | undefined;
    const configured = runtimeConfig?.grafanaUrl;
    if (configured) {
        return configured;
    }
    if (import.meta.env.VITE_GRAFANA_URL) {
        return import.meta.env.VITE_GRAFANA_URL;
    }
    return `${resolveBaseUrl()}grafana`;
};

export const resolvePrometheusBaseUrl = (): string => {
    const runtimeConfig = window.__AGGREGATOR_UI__ as AggregatorUiRuntimeConfig | undefined;
    const configured = runtimeConfig?.prometheusUrl;
    if (configured) {
        return configured;
    }
    if (import.meta.env.VITE_PROMETHEUS_URL) {
        return import.meta.env.VITE_PROMETHEUS_URL;
    }
    return `${window.location.origin}/prometheus`;
};

export const resolveSidebarTitle = (): string => (import.meta.env.VITE_APP_TITLE ?? '').trim();

export const parsePrometheusHealthStatus = (value: number): HealthStatus => {
    let status: HealthStatus = 'unknown';
    if (Number.isFinite(value)) {
        if (value >= 0.9) {
            status = 'up';
        } else if (value <= 0.1) {
            status = 'down';
        }
    }
    return status;
};

export const compareHealthStatus = (left: HealthStatus, right: HealthStatus): number => {
    const order: Record<HealthStatus, number> = {down: 0, unknown: 1, up: 2};
    return order[left] - order[right];
};

const normalizeDashboardBaseUrl = (
    baseUrl: string,
    dashboardUid: string,
    dashboardSlug = dashboardUid,
): string => {
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

export const buildDashboardUrl = (
    baseUrl: string,
    dashboardUid: string,
    dashboardSlug: string,
    itemId: string,
    theme: 'dark' | 'light',
    panelId: string | number | null | undefined,
    appBaseUrl = '',
): string => {
    const params = new URLSearchParams({
        orgId: '1',
        'var-item_id': itemId,
        'var-app_base_url': appBaseUrl,
        theme,
        from: `now-${TIMELINE_DEFAULT_RANGE}`,
        to: 'now',
    });
    if (panelId !== null && panelId !== undefined && panelId !== '') {
        params.set('viewPanel', String(panelId));
    }
    const normalizedBaseUrl = normalizeDashboardBaseUrl(baseUrl, dashboardUid, dashboardSlug);
    return `${normalizedBaseUrl}?${params.toString()}&kiosk`;
};

export const buildGrafanaFrameUrl = (
    {initialTheme, grafanaUrl = ''}: {initialTheme?: string; grafanaUrl?: string} = {},
): string => {
    const frameUrl = new URL('grafana-frame/index.html', resolveBaseUrl());
    frameUrl.searchParams.set('rev', GRAFANA_FRAME_WRAPPER_REV);
    frameUrl.searchParams.set('theme', initialTheme === 'dark' ? 'dark' : 'light');
    if (grafanaUrl) {
        frameUrl.searchParams.set('src', encodeURIComponent(grafanaUrl));
    }
    return frameUrl.toString();
};

export const loadCatalog = async (): Promise<{
    items: CatalogItem[];
    dependencies: CatalogDependency[];
    contacts: CatalogContact[];
    itemContacts: CatalogItemContact[];
}> => {
    const [itemsResponse, dependenciesResponse, contactsData, itemContactsData] = await Promise.all([
        fetch(new URL('catalog-items.yaml', resolveBaseUrl())),
        fetch(new URL('catalog-dependencies.yaml', resolveBaseUrl())),
        loadOptionalYaml('catalog-contacts.yaml'),
        loadOptionalYaml('catalog-item-contacts.yaml'),
    ]);

    if (!itemsResponse.ok) {
        throw new Error(`Failed to load catalog items: ${itemsResponse.status}`);
    }
    if (!dependenciesResponse.ok) {
        throw new Error(`Failed to load catalog dependencies: ${dependenciesResponse.status}`);
    }

    const [itemsText, dependenciesText] = await Promise.all([
        itemsResponse.text(),
        dependenciesResponse.text(),
    ]);
    const itemsData = (yaml.load(itemsText, {}) || {}) as {items?: unknown};
    const dependenciesData = (yaml.load(dependenciesText, {}) || {}) as {dependencies?: unknown};
    const contactsPayload = contactsData as {contacts?: unknown};
    const itemContactsPayload = itemContactsData as {itemContacts?: unknown};
    return {
        items: normalizeItems(itemsData.items),
        dependencies: normalizeDependencies(dependenciesData.dependencies),
        contacts: normalizeContacts(contactsPayload.contacts),
        itemContacts: normalizeItemContacts(itemContactsPayload.itemContacts),
    };
};

const normalizeItems = (rawItems: unknown): CatalogItem[] => {
    if (!Array.isArray(rawItems)) {
        return [];
    }
    return rawItems
        .filter((entry): entry is {id?: string; title?: string} => Boolean(entry))
        .map((item) => ({
            id: String(item.id || '').trim(),
            title: String(item.title || item.id || '').trim(),
        }))
        .filter((item) => Boolean(item.id));
};

const normalizeDependencies = (rawDependencies: unknown): CatalogDependency[] => {
    if (!Array.isArray(rawDependencies)) {
        return [];
    }
    return rawDependencies
        .filter((entry): entry is {sourceId?: string; targetId?: string} => Boolean(entry))
        .map((dependency) => ({
            sourceId: String(dependency.sourceId || '').trim(),
            targetId: String(dependency.targetId || '').trim(),
        }))
        .filter((dependency) => Boolean(dependency.sourceId) && Boolean(dependency.targetId));
};

const normalizeContacts = (rawContacts: unknown): CatalogContact[] => {
    if (!Array.isArray(rawContacts)) {
        return [];
    }
    return rawContacts
        .filter((entry): entry is {id?: string; title?: string; type?: string; href?: string} => Boolean(entry))
        .map((contact) => ({
            id: String(contact.id || '').trim(),
            title: String(contact.title || contact.id || '').trim(),
            type: String(contact.type || '').trim(),
            href: String(contact.href || '').trim(),
        }))
        .filter((contact) => Boolean(contact.id) && Boolean(contact.type));
};

const normalizeItemContacts = (rawItemContacts: unknown): CatalogItemContact[] => {
    if (!Array.isArray(rawItemContacts)) {
        return [];
    }
    return rawItemContacts
        .filter((entry): entry is {itemId?: string; contactId?: string} => Boolean(entry))
        .map((itemContact) => ({
            itemId: String(itemContact.itemId || '').trim(),
            contactId: String(itemContact.contactId || '').trim(),
        }))
        .filter((itemContact) => Boolean(itemContact.itemId) && Boolean(itemContact.contactId));
};

const loadOptionalYaml = async (path: string): Promise<unknown> => {
    const response = await fetch(new URL(path, resolveBaseUrl()));
    if (!response.ok) {
        return {};
    }
    const text = await response.text();
    return (yaml.load(text, {}) || {}) as unknown;
};

export const fetchPrometheusStatuses = async (
    prometheusBaseUrl: string,
): Promise<{itemStatuses: Record<string, HealthStatus>; itemSignals: Record<string, ItemSignal[]>}> => {
    const [itemResponse, signalResponse] = await Promise.all([
        fetch(`${prometheusBaseUrl}/api/v1/query?query=${encodeURIComponent('catalog_item_state')}`),
        fetch(`${prometheusBaseUrl}/api/v1/query?query=${encodeURIComponent('catalog_item_signal_state')}`),
    ]);

    const nextStatuses: Record<string, HealthStatus> = {};
    const nextItemSignals: Record<string, ItemSignal[]> = {};

    if (itemResponse.ok) {
        const itemContentType = itemResponse.headers.get('content-type') || '';
        if (itemContentType.includes('application/json')) {
            const payload = (await itemResponse.json()) as PrometheusQueryPayload;
            const results = payload.data?.result ?? [];
            results.forEach((entry) => {
                const itemId = entry.metric?.item_id;
                if (!itemId) {
                    return;
                }
                const value = Number.parseFloat(String(entry.value?.[1] ?? 'NaN'));
                nextStatuses[itemId] = parsePrometheusHealthStatus(value);
            });
        }
    }

    if (signalResponse.ok) {
        const signalContentType = signalResponse.headers.get('content-type') || '';
        if (signalContentType.includes('application/json')) {
            const payload = (await signalResponse.json()) as PrometheusQueryPayload;
            const results = payload.data?.result ?? [];
            results.forEach((entry) => {
                const itemId = entry.metric?.item_id;
                const signalId = entry.metric?.signal_id;
                const signalName = entry.metric?.signal_name || signalId;
                if (!itemId) {
                    return;
                }
                const value = Number.parseFloat(String(entry.value?.[1] ?? 'NaN'));
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

export const submitFeedback = async (
    text: string,
): Promise<{id: string; receivedAt: string}> => {
    const response = await fetch('/api/feedback', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({text}),
    });
    if (!response.ok) {
        let details = '';
        try {
            const payload = (await response.json()) as {message?: string; error?: string};
            details = payload.message || payload.error || '';
        } catch {
            // Ignore non-JSON error payloads and fall back to status.
        }
        throw new Error(details || `Failed to submit feedback: ${response.status}`);
    }
    return (await response.json()) as { id: string; receivedAt: string };
};
