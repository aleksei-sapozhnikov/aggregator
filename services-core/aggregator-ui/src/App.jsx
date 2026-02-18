import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import yaml from 'js-yaml';

const DASHBOARDS = {
    timeline: {
        uid: 'catalog-item-state-timeline',
        slug: 'catalog-item-state-timeline',
        panelId: 2001,
    },
};

const MOBILE_BREAKPOINT = 1100;

const sortItemsByName = (items) =>
    [...items].sort((a, b) => (a.name || a.id).localeCompare(b.name || b.id));

const sortNodesByName = (nodes) =>
    [...nodes].sort((a, b) =>
        (a.item.name || a.item.id).localeCompare(b.item.name || b.item.id),
    );

const parsePrometheusHealthStatus = (value) => {
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

const compareHealthStatus = (left, right) => {
    const order = {down: 0, unknown: 1, up: 2};
    const leftRank = order[left] ?? 3;
    const rightRank = order[right] ?? 3;
    if (leftRank !== rightRank) {
        return leftRank - rightRank;
    }
    return 0;
};

const collectNodeIds = (nodes) => {
    const ids = [];
    const visit = (node) => {
        ids.push(node.item.id);
        node.children.forEach(visit);
    };
    nodes.forEach(visit);
    return ids;
};

const collectDescendantIds = (node) => {
    const descendants = [];
    const visit = (children) => {
        children.forEach((child) => {
            descendants.push(child.item.id);
            visit(child.children);
        });
    };
    visit(node.children);
    return descendants;
};

const collectExpandableIds = (nodes) =>
    collectNodeIds(nodes).filter((id, index, arr) => arr.indexOf(id) === index);

const buildCatalogTree = (items, dependencies) => {
    const itemMap = new Map(items.map((item) => [item.id, item]));
    const childrenMap = new Map();
    const childIds = new Set();

    dependencies
        .forEach((dep) => {
            if (!itemMap.has(dep.sourceId) || !itemMap.has(dep.targetId)) {
                return;
            }
            childIds.add(dep.targetId);
            const list = childrenMap.get(dep.sourceId) || [];
            list.push(dep.targetId);
            childrenMap.set(dep.sourceId, list);
        });

    const rootItems = sortItemsByName(items.filter((item) => !childIds.has(item.id)));

    const toNode = (itemId, visited = new Set(), pathSegments = [], pathIds = []) => {
        if (visited.has(itemId)) {
            return null;
        }
        visited.add(itemId);
        const item = itemMap.get(itemId);
        if (!item) {
            return null;
        }
        const uid = pathSegments.join('/');
        const path = [...pathIds, itemId];
        const children = sortNodesByName(
            (childrenMap.get(itemId) || [])
                .map((childId, index) =>
                    toNode(
                        childId,
                        new Set(visited),
                        [...pathSegments, `${index}:${childId}`],
                        path,
                    ),
                )
                .filter(Boolean),
        );
        return {item, children, uid, path};
    };

    return rootItems
        .map((item, index) => toNode(item.id, new Set(), [`${index}:${item.id}`], []))
        .filter(Boolean);
};

const normalizeSearchText = (value) => value.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

const matchSearch = (item, queryTokens) => {
    if (!queryTokens.length) {
        return true;
    }
    const name = normalizeSearchText(item.name || '');
    const id = normalizeSearchText(item.id || '');
    const type = normalizeSearchText(item.type || '');
    const haystack = `${name} ${id} ${type}`.trim();
    return queryTokens.every((token) => haystack.includes(token));
};

const filterCatalogTree = (nodes, queryTokens) => {
    if (!queryTokens.length) {
        return nodes;
    }
    const visit = (node) => {
        const filteredChildren = node.children
            .map(visit)
            .filter(Boolean);
        if (matchSearch(node.item, queryTokens) || filteredChildren.length > 0) {
            return {...node, children: filteredChildren};
        }
        return null;
    };
    return nodes.map(visit).filter(Boolean);
};

const findNodePath = (nodes, targetId) => {
    for (const node of nodes) {
        if (node.item.id === targetId) {
            return [node.item.id];
        }
        if (node.children.length) {
            const childPath = findNodePath(node.children, targetId);
            if (childPath) {
                return [node.item.id, ...childPath];
            }
        }
    }
    return null;
};

const findNodeById = (nodes, targetId) => {
    for (const node of nodes) {
        if (node.item.id === targetId) {
            return node;
        }
        if (node.children.length) {
            const found = findNodeById(node.children, targetId);
            if (found) {
                return found;
            }
        }
    }
    return null;
};

const findNodeByPath = (nodes, pathIds) => {
    if (!Array.isArray(pathIds) || pathIds.length === 0) {
        return null;
    }
    const [head, ...rest] = pathIds;
    for (const node of nodes) {
        if (node.item.id !== head) {
            continue;
        }
        if (rest.length === 0) {
            return node;
        }
        const found = findNodeByPath(node.children, rest);
        if (found) {
            return found;
        }
    }
    return null;
};

const findNodeUidById = (nodes, targetId) => {
    for (const node of nodes) {
        if (node.item.id === targetId) {
            return node.uid;
        }
        if (node.children.length) {
            const found = findNodeUidById(node.children, targetId);
            if (found) {
                return found;
            }
        }
    }
    return null;
};
const rankSearchResults = (items, queryTokens) => {
    if (!queryTokens.length) {
        return [];
    }
    const results = [];
    items.forEach((item) => {
        const name = normalizeSearchText(item.name || '');
        const id = normalizeSearchText(item.id || '');
        const type = normalizeSearchText(item.type || '');
        const haystack = `${name} ${id} ${type}`.trim();
        if (!queryTokens.every((token) => haystack.includes(token))) {
            return;
        }
        let score = 0;
        queryTokens.forEach((token) => {
            if (name.includes(token)) {
                score += 3;
            }
            if (id.includes(token)) {
                score += 2;
            }
            if (type.includes(token)) {
                score += 1;
            }
        });
        results.push({item, score});
    });
    return results
        .sort((a, b) => b.score - a.score || (a.item.name || a.item.id).localeCompare(b.item.name || b.item.id));
};

const getInitialTheme = () => {
    const stored = localStorage.getItem('aggregator-ui-theme');
    if (stored) {
        return stored;
    }
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
};

const resolveBasePath = () => {
    const baseUrl = import.meta.env.BASE_URL || '/';
    return new URL(baseUrl, window.location.origin).pathname;
};

const resolveBaseUrl = () => `${window.location.origin}${resolveBasePath()}`;

const resolveGrafanaBaseUrl = () => {
    const configured = window.__AGGREGATOR_UI__?.grafanaUrl;
    if (configured) {
        return configured;
    }
    if (import.meta.env.VITE_GRAFANA_URL) {
        return import.meta.env.VITE_GRAFANA_URL;
    }
    return `${resolveBaseUrl()}grafana`;
};

const resolvePrometheusBaseUrl = () => {
    const configured = window.__AGGREGATOR_UI__?.prometheusUrl;
    if (configured) {
        return configured;
    }
    if (import.meta.env.VITE_PROMETHEUS_URL) {
        return import.meta.env.VITE_PROMETHEUS_URL;
    }
    return `${window.location.origin}/prometheus`;
};

const stripBasePath = (pathname, basePath) => {
    if (!basePath || basePath === '/') {
        return pathname.replace(/^\/+/, '');
    }
    const normalizedBase = basePath.endsWith('/') ? basePath : `${basePath}/`;
    if (pathname.startsWith(normalizedBase)) {
        return pathname.slice(normalizedBase.length);
    }
    if (pathname.startsWith(basePath)) {
        return pathname.slice(basePath.length).replace(/^\/+/, '');
    }
    return pathname.replace(/^\/+/, '');
};

const parseServicePath = (value) => {
    if (!value) {
        return [];
    }
    return value
        .split('/')
        .map((segment) => decodeURIComponent(segment))
        .filter(Boolean);
};

const buildServicePath = (pathIds) =>
    pathIds.map((segment) => encodeURIComponent(segment)).join('/');

const resolveNodeFromLocation = (nodes, basePath) => {
    if (!nodes.length) {
        return null;
    }
    const params = new URLSearchParams(window.location.search);
    const servicePath = parseServicePath(params.get('path'));
    const relativePath = stripBasePath(window.location.pathname, basePath);
    let routeId = '';
    if (relativePath.startsWith('item/')) {
        const rest = relativePath.slice('item/'.length);
        const [segment] = rest.split('/').filter(Boolean);
        if (segment) {
            routeId = decodeURIComponent(segment);
        }
    }

    const hasRouteId = Boolean(routeId);
    const hasPathParam = servicePath.length > 0;

    if (hasPathParam) {
        const byPath = findNodeByPath(nodes, servicePath);
        if (byPath) {
            return {node: byPath};
        }
        const fallbackId = servicePath[servicePath.length - 1];
        if (fallbackId) {
            const byId = findNodeById(nodes, fallbackId);
            if (byId) {
                return {node: byId};
            }
        }
    }

    if (hasRouteId) {
        const byId = findNodeById(nodes, routeId);
        return byId ? {node: byId} : null;
    }

    return null;
};

const readLocationRouteContext = (basePath) => {
    const params = new URLSearchParams(window.location.search);
    const pathParamRaw = params.get('path') || '';
    const pathIds = parseServicePath(pathParamRaw);
    const relativePath = stripBasePath(window.location.pathname, basePath);
    let routeId = '';
    if (relativePath.startsWith('item/')) {
        const rest = relativePath.slice('item/'.length);
        const [segment] = rest.split('/').filter(Boolean);
        if (segment) {
            routeId = decodeURIComponent(segment);
        }
    }
    return {
        routeId,
        pathIds,
        hasRouteId: Boolean(routeId),
        hasPathParam: pathIds.length > 0,
    };
};

const normalizeDashboardBaseUrl = (
    baseUrl,
    dashboardUid,
    dashboardSlug = dashboardUid,
) => {
    const url = new URL(baseUrl, window.location.origin);
    const segments = url.pathname.split('/').filter(Boolean);
    const dashboardSegment = 'd';
    const dashboardIndex = segments.findIndex((segment) => segment === 'd' || segment === 'd-solo');

    if (dashboardIndex !== -1 && segments[dashboardIndex + 1] === dashboardUid) {
        segments[dashboardIndex] = dashboardSegment;
        if (segments[dashboardIndex + 2]) {
            segments.length = dashboardIndex + 3;
        } else {
            segments.length = dashboardIndex + 2;
            segments.push(dashboardSlug);
        }
    } else {
        segments.push(dashboardSegment, dashboardUid, dashboardSlug);
    }

    url.pathname = `/${segments.join('/')}`;
    url.search = '';
    url.hash = '';

    return url.toString().replace(/\/$/, '');
};

const buildDashboardUrl = (
    baseUrl,
    dashboardUid,
    dashboardSlug,
    itemId,
    theme,
    panelId,
) => {
    const params = new URLSearchParams({
        orgId: '1',
        'var-item_id': itemId,
        theme,
    });
    if (panelId) {
        params.set('viewPanel', panelId);
    }
    const normalizedBaseUrl = normalizeDashboardBaseUrl(baseUrl, dashboardUid, dashboardSlug);
    return `${normalizedBaseUrl}?${params.toString()}&kiosk`;
};

const CatalogNode = ({
                         node,
                         selectedId,
                         onSelect,
                         expandedIds,
                         onToggleNode,
                         disableAnimation,
                         grafanaBaseUrl,
                         theme,
                         status,
                         statuses,
                         lastUpdated,
                     }) => {
    const hasChildren = node.children.length > 0;
    const isExpanded = expandedIds.has(node.item.id);
    buildDashboardUrl(
        grafanaBaseUrl,
        DASHBOARDS.timeline.uid,
        DASHBOARDS.timeline.slug,
        node.item.id,
        theme,
        DASHBOARDS.timeline.panelId,
    );
    const statusLabel = `Status: ${status.toUpperCase()}${
        lastUpdated ? ` (at ${lastUpdated})` : ''
    }`;

    const row = (
        <div
            className={`node-row ${selectedId === node.item.id ? 'is-selected' : ''}`}
            data-node-id={node.uid}
        >
            <div className="node-main">
                {hasChildren ? (
                    <button
                        className={`node-toggle ${isExpanded ? 'is-expanded' : ''}`}
                        type="button"
                        aria-label={isExpanded ? 'Collapse children' : 'Expand children'}
                        title={isExpanded ? 'Collapse children' : 'Expand children'}
                        onClick={(event) => {
                            event.stopPropagation();
                            onToggleNode(node);
                        }}
                    >
                        <span
                            className={`affected-chevron ${isExpanded ? 'is-open' : ''}`}
                            aria-hidden="true"
                        >
                            ›
                        </span>
                    </button>
                ) : (
                    <span className="node-toggle-spacer" aria-hidden="true"/>
                )}
                <div
                    className="node-label"
                    onClick={(event) => {
                        event.stopPropagation();
                        onSelect(node);
                    }}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault();
                            onSelect(node);
                        }
                    }}
                >
          <span className="node-heading">
            <span
                className={`status-indicator status-${status}`}
                aria-label={statusLabel}
                title={statusLabel}
            />
              {node.item.name && <span className="node-name">{node.item.name}</span>}
          </span>
                    {(node.item.id || node.item.type) && (
                        <span className="node-identity">
              {node.item.id}
                            {node.item.type ? ` (${node.item.type})` : ''}
            </span>
                    )}
                </div>
            </div>
        </div>
    );

    if (!hasChildren) {
        return <div className="catalog-item node-leaf">{row}</div>;
    }

    return (
        <div className="catalog-item">
            {row}
            <div className={`node-children ${isExpanded ? 'is-expanded' : ''}`}>
                {isExpanded &&
                    node.children.map((child) => (
                        <CatalogNode
                            key={child.item.id}
                            node={child}
                            selectedId={selectedId}
                            onSelect={onSelect}
                            expandedIds={expandedIds}
                            onToggleNode={onToggleNode}
                            disableAnimation={disableAnimation}
                            grafanaBaseUrl={grafanaBaseUrl}
                            theme={theme}
                            status={statuses[child.item.id] || 'unknown'}
                            statuses={statuses}
                            lastUpdated={lastUpdated}
                        />
                    ))}
            </div>
        </div>
    );
};

export default function App() {
    const [catalog, setCatalog] = useState({items: [], dependencies: []});
    const [selectedId, setSelectedId] = useState('');
    const [error, setError] = useState('');
    const [theme, setTheme] = useState(getInitialTheme);
    const [expandedIds, setExpandedIds] = useState(() => new Set());
    const [itemStatuses, setItemStatuses] = useState({});
    const [itemCheckDown, setItemCheckDown] = useState({});
    const [itemChecks, setItemChecks] = useState({});
    const [lastUpdated, setLastUpdated] = useState('');
    const [isMobileLayout, setIsMobileLayout] = useState(
        () => window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT}px)`).matches,
    );
    const [isDesktopSidebarOpen, setIsDesktopSidebarOpen] = useState(true);
    const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
    const [isSearchActive, setIsSearchActive] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [pendingScrollId, setPendingScrollId] = useState('');
    const [disableTreeAnimation, setDisableTreeAnimation] = useState(false);
    const [isAffectedOpen, setIsAffectedOpen] = useState(false);
    const [isChecksOpen, setIsChecksOpen] = useState(false);
    const affectedAutoOpenRef = useRef(true);
    const checksAutoOpenRef = useRef(true);
    const [grafanaHeight, setGrafanaHeight] = useState(0);
    const prevSearchTokensRef = useRef(0);
    const clearSearchRequestedRef = useRef(false);
    const catalogTreeRef = useRef(null);
    const grafanaIframeRef = useRef(null);
    const grafanaEscHandlerRef = useRef(null);
    const contentRef = useRef(null);
    const headerRef = useRef(null);

    const grafanaBaseUrl = useMemo(resolveGrafanaBaseUrl, []);
    const prometheusBaseUrl = useMemo(resolvePrometheusBaseUrl, []);
    const basePath = useMemo(resolveBasePath, []);

    const updateUrlForItemId = useCallback((itemId, {replace} = {}) => {
        const url = new URL(window.location.href);
        const normalizedBase = basePath.endsWith('/') ? basePath.slice(0, -1) : basePath;
        const prefix = normalizedBase === '' ? '' : normalizedBase;
        url.pathname = `${prefix}/item/${encodeURIComponent(itemId)}`;
        url.search = '';
        const nextUrl = url.toString();
        if (nextUrl === window.location.href) {
            return;
        }
        if (replace) {
            window.history.replaceState({}, '', url);
        } else {
            window.history.pushState({}, '', url);
        }
    }, [basePath]);

    const updateUrlForNode = useCallback((node, {replace} = {}) => {
        if (!node) {
            return;
        }
        const url = new URL(window.location.href);
        const normalizedBase = basePath.endsWith('/') ? basePath.slice(0, -1) : basePath;
        const prefix = normalizedBase === '' ? '' : normalizedBase;
        url.pathname = `${prefix}/item/${encodeURIComponent(node.item.id)}`;
        url.search = '';
        if (node.path?.length) {
            url.searchParams.set('path', buildServicePath(node.path));
        }
        const nextUrl = url.toString();
        if (nextUrl === window.location.href) {
            return;
        }
        if (replace) {
            window.history.replaceState({}, '', url);
        } else {
            window.history.pushState({}, '', url);
        }
    }, [basePath]);

    const normalizeUrlForRoute = useCallback((itemId, pathIds, {replace} = {}) => {
        if (!itemId) {
            return;
        }
        const url = new URL(window.location.href);
        const normalizedBase = basePath.endsWith('/') ? basePath.slice(0, -1) : basePath;
        const prefix = normalizedBase === '' ? '' : normalizedBase;
        url.pathname = `${prefix}/item/${encodeURIComponent(itemId)}`;
        url.search = '';
        if (Array.isArray(pathIds) && pathIds.length > 0) {
            url.searchParams.set('path', buildServicePath(pathIds));
        }
        const nextUrl = url.toString();
        if (nextUrl === window.location.href) {
            return;
        }
        if (replace) {
            window.history.replaceState({}, '', url);
        } else {
            window.history.pushState({}, '', url);
        }
    }, [basePath]);

    const handleGrafanaLoad = useCallback(() => {
        const iframe = grafanaIframeRef.current;
        if (!iframe?.contentWindow) {
            return;
        }
        try {
            const previousHandler = grafanaEscHandlerRef.current;
            if (previousHandler) {
                iframe.contentWindow.removeEventListener('keydown', previousHandler, true);
            }
            const handler = (event) => {
                if (event.key === 'Escape' || event.keyCode === 27) {
                    event.preventDefault();
                    event.stopPropagation();
                }
            };
            grafanaEscHandlerRef.current = handler;
            iframe.contentWindow.addEventListener('keydown', handler, true);

            const mousetrap = iframe.contentWindow.Mousetrap;
            if (mousetrap) {
                mousetrap.unbindGlobal?.('esc');
                mousetrap.unbind?.('esc');
            }
        } catch (error) {
            // Ignore cross-origin access issues when Grafana is hosted elsewhere.
        }
    }, []);

    useEffect(
        () => () => {
            const iframe = grafanaIframeRef.current;
            const handler = grafanaEscHandlerRef.current;
            if (iframe?.contentWindow && handler) {
                iframe.contentWindow.removeEventListener('keydown', handler, true);
            }
        },
        [],
    );

    useEffect(() => {
        document.body.dataset.theme = theme;
        localStorage.setItem('aggregator-ui-theme', theme);
    }, [theme]);

    useEffect(() => {
        const updateHeight = () => {
            if (!contentRef.current || !headerRef.current) {
                return;
            }
            const styles = window.getComputedStyle(contentRef.current);
            const paddingTop = Number.parseFloat(styles.paddingTop) || 0;
            const paddingBottom = Number.parseFloat(styles.paddingBottom) || 0;
            const gap = Number.parseFloat(styles.rowGap || styles.gap) || 0;
            const headerHeight = headerRef.current.getBoundingClientRect().height;
            const nextHeight = Math.max(
                320,
                Math.floor(window.innerHeight - paddingTop - paddingBottom - headerHeight - gap),
            );
            setGrafanaHeight(nextHeight);
        };

        updateHeight();
        window.addEventListener('resize', updateHeight);
        let headerObserver;
        if (window.ResizeObserver && headerRef.current) {
            headerObserver = new ResizeObserver(updateHeight);
            headerObserver.observe(headerRef.current);
        }
        return () => {
            window.removeEventListener('resize', updateHeight);
            if (headerObserver) {
                headerObserver.disconnect();
            }
        };
    }, []);

    useEffect(() => {
        const mediaQuery = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT}px)`);
        const updateLayout = (event) => {
            setIsMobileLayout(event.matches);
        };

        setIsMobileLayout(mediaQuery.matches);
        mediaQuery.addEventListener('change', updateLayout);

        return () => {
            mediaQuery.removeEventListener('change', updateLayout);
        };
    }, []);

    useEffect(() => {
        if (isMobileLayout) {
            setIsMobileSidebarOpen(false);
        }
    }, [isMobileLayout]);

    useEffect(() => {
        const loadCatalog = async () => {
            try {
                const response = await fetch(new URL('catalog.yaml', resolveBaseUrl()));
                if (!response.ok) {
                    setError(`Failed to load catalog: ${response.status}`);
                    return;
                }
                const text = await response.text();
                const data = yaml.load(text) || {};
                const items = Array.isArray(data.items) ? data.items : [];
                const dependencies = Array.isArray(data.dependencies) ? data.dependencies : [];
                setCatalog({items, dependencies});
                setSelectedId((prev) => prev || items[0]?.id || '');
            } catch (err) {
                setError(err.message);
            }
        };

        loadCatalog();
    }, []);

    useEffect(() => {
        if (!catalog.items.length) {
            return undefined;
        }

        let cancelled = false;

        const fetchStatuses = async () => {
            try {
                const [itemResponse, checkResponse] = await Promise.all([
                    fetch(
                        `${prometheusBaseUrl}/api/v1/query?query=${encodeURIComponent('catalog_item_state')}`,
                    ),
                    fetch(
                        `${prometheusBaseUrl}/api/v1/query?query=${encodeURIComponent('catalog_item_check_state')}`,
                    ),
                ]);

                if (itemResponse.ok) {
                    const contentType = itemResponse.headers.get('content-type') || '';
                    if (contentType.includes('application/json')) {
                        const payload = await itemResponse.json();
                        const results = payload?.data?.result ?? [];
                        const nextStatuses = {};
                        results.forEach((entry) => {
                            const itemId = entry?.metric?.item_id;
                            if (!itemId) {
                                return;
                            }
                            const value = Number.parseFloat(entry?.value?.[1]);
                            nextStatuses[itemId] = parsePrometheusHealthStatus(value);
                        });
                        if (!cancelled) {
                            setItemStatuses(nextStatuses);
                            setLastUpdated(new Date().toLocaleTimeString());
                        }
                    }
                } else {
                    console.error(`Failed to load Prometheus data: ${itemResponse.status}`);
                }

                if (checkResponse.ok) {
                    const contentType = checkResponse.headers.get('content-type') || '';
                    if (contentType.includes('application/json')) {
                        const payload = await checkResponse.json();
                        const results = payload?.data?.result ?? [];
                        const nextCheckDown = {};
                        const nextItemChecks = {};
                        results.forEach((entry) => {
                            const itemId = entry?.metric?.item_id;
                            const checkId = entry?.metric?.check_id;
                            if (!itemId) {
                                return;
                            }
                            const value = Number.parseFloat(entry?.value?.[1]);
                            const status = parsePrometheusHealthStatus(value);
                            if (checkId) {
                                const list = nextItemChecks[itemId] || [];
                                list.push({id: checkId, status});
                                nextItemChecks[itemId] = list;
                            }
                            if (status === 'down') {
                                nextCheckDown[itemId] = true;
                            }
                        });
                        if (!cancelled) {
                            setItemCheckDown(nextCheckDown);
                            setItemChecks(nextItemChecks);
                        }
                    }
                } else {
                    console.error(`Failed to load Prometheus data: ${checkResponse.status}`);
                }
            } catch (err) {
                if (!cancelled) {
                    console.error(err);
                }
            }
        };

        fetchStatuses();
        const interval = window.setInterval(fetchStatuses, 10000);
        return () => {
            cancelled = true;
            window.clearInterval(interval);
        };
    }, [catalog.items, prometheusBaseUrl]);

    const tree = useMemo(
        () => buildCatalogTree(catalog.items, catalog.dependencies),
        [catalog.items, catalog.dependencies],
    );
    const itemMap = useMemo(
        () => new Map(catalog.items.map((item) => [item.id, item])),
        [catalog.items],
    );
    const searchTokens = useMemo(
        () => normalizeSearchText(searchQuery).split(' ').filter(Boolean),
        [searchQuery],
    );
    const filteredTree = useMemo(
        () => filterCatalogTree(tree, searchTokens),
        [tree, searchTokens],
    );
    const searchResults = useMemo(
        () => rankSearchResults(catalog.items, searchTokens),
        [catalog.items, searchTokens],
    );

    const handleToggleNode = useCallback((node) => {
        setExpandedIds((prev) => {
            const next = new Set(prev);
            const descendants = collectDescendantIds(node);

            if (!next.has(node.item.id)) {
                next.add(node.item.id);
                return next;
            }

            next.delete(node.item.id);
            descendants.forEach((id) => next.delete(id));
            return next;
        });
    }, []);

    const expandPathToItem = useCallback((itemId, {suppressAnimation, path} = {}) => {
        const resolvedPath = path && path.length ? path : findNodePath(tree, itemId);
        const ancestors = resolvedPath ? resolvedPath.slice(0, -1) : [];
        setExpandedIds(new Set(ancestors));
        if (suppressAnimation) {
            setDisableTreeAnimation(true);
            window.requestAnimationFrame(() => {
                setDisableTreeAnimation(false);
            });
        }
    }, [tree]);

    const handleExpandAll = useCallback(() => {
        setExpandedIds(new Set(collectExpandableIds(tree)));
    }, [tree]);

    const handleCollapseAll = useCallback(() => {
        setExpandedIds(new Set());
    }, []);

    const selectedItem = catalog.items.find((item) => item.id === selectedId);
    const selectedStatus = selectedItem ? itemStatuses[selectedItem.id] || 'unknown' : 'unknown';
    const affectedItems = useMemo(() => {
        if (!selectedItem) {
            return [];
        }
        const node = findNodeById(tree, selectedItem.id);
        if (!node) {
            return [];
        }
        const descendants = collectDescendantIds(node);
        const affected = [];
        const seen = new Set();
        descendants.forEach((id) => {
            if (seen.has(id)) {
                return;
            }
            seen.add(id);
            if (!itemCheckDown[id]) {
                return;
            }
            const item = itemMap.get(id);
            affected.push({
                id,
                name: item?.name || id,
                status: 'down',
            });
        });
        return affected.sort((a, b) => a.name.localeCompare(b.name));
    }, [itemCheckDown, itemMap, selectedItem, tree]);

    const selectedChecks = useMemo(() => {
        if (!selectedItem) {
            return [];
        }
        const checks = itemChecks[selectedItem.id] || [];
        return [...checks].sort((a, b) => {
            const statusCompare = compareHealthStatus(a.status, b.status);
            if (statusCompare !== 0) {
                return statusCompare;
            }
            return a.id.localeCompare(b.id);
        });
    }, [itemChecks, selectedItem]);

    const checkSummary = useMemo(() => {
        const okCount = selectedChecks.filter((check) => check.status === 'up').length;
        const failingChecks = selectedChecks.filter((check) => check.status === 'down');
        if (failingChecks.length === 0) {
            return {
                text: `Health checks: ${okCount} ok`,
                failingList: '',
            };
        }
        const failingList = failingChecks.map((check) => check.id).join(', ');
        return {
            text: `Health checks: ${okCount} ok, ${failingChecks.length} failing: ${failingList}`,
            failingList,
        };
    }, [selectedChecks, selectedId]);
    const isSidebarOpen = isMobileLayout ? isMobileSidebarOpen : isDesktopSidebarOpen;
    const shouldOffsetContentHeader = isMobileLayout || !isSidebarOpen;

    const handleToggleSidebar = useCallback(() => {
        if (isMobileLayout) {
            setIsMobileSidebarOpen((prev) => !prev);
            return;
        }
        setIsDesktopSidebarOpen((prev) => !prev);
    }, [isMobileLayout]);

    const handleSelectItem = useCallback((node) => {
        setSelectedId(node.item.id);
        setPendingScrollId(node.uid);
        setIsMobileSidebarOpen(false);
        updateUrlForNode(node);
    }, [updateUrlForNode]);

    const handleSelectItemById = useCallback((itemId) => {
        setSelectedId(itemId);
        const selectedNode = findNodeById(tree, itemId);
        if (selectedNode) {
            setPendingScrollId(selectedNode.uid);
            updateUrlForNode(selectedNode);
        } else {
            const selectedUid = findNodeUidById(tree, itemId);
            setPendingScrollId(selectedUid || '');
            updateUrlForItemId(itemId);
        }
        setIsMobileSidebarOpen(false);
    }, [tree, updateUrlForItemId, updateUrlForNode]);

    const handleClearSearch = useCallback(() => {
        clearSearchRequestedRef.current = true;
        setSearchQuery('');
        setIsSearchActive(false);
    }, []);

    useEffect(() => {
        setIsAffectedOpen(false);
        affectedAutoOpenRef.current = true;
        setIsChecksOpen(false);
        checksAutoOpenRef.current = true;
    }, [selectedId]);

    useEffect(() => {
        if (!affectedAutoOpenRef.current) {
            return;
        }
        if (selectedStatus !== 'up' && affectedItems.length > 0) {
            setIsAffectedOpen(true);
            affectedAutoOpenRef.current = false;
        }
    }, [affectedItems.length, selectedId, selectedStatus]);

    useEffect(() => {
        if (!checksAutoOpenRef.current) {
            return;
        }
        if (selectedChecks.length === 0) {
            return;
        }
        const hasNonUp = selectedChecks.some((check) => check.status !== 'up');
        if (hasNonUp) {
            setIsChecksOpen(true);
        }
        checksAutoOpenRef.current = false;
    }, [selectedChecks]);

    useEffect(() => {
        if (!isSearchActive) {
            return undefined;
        }
        const handleKeyDown = (event) => {
            if (event.key === 'Escape' || event.keyCode === 27) {
                event.preventDefault();
                handleClearSearch();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
        };
    }, [handleClearSearch, isSearchActive]);

    const scrollToNodeId = useCallback((targetId) => {
        const container = catalogTreeRef.current;
        if (!container) {
            return;
        }
        const startedAt = performance.now();
        const tryScroll = () => {
            const node = container.querySelector(`[data-node-id="${targetId}"]`);
            if (node) {
                if (!node.offsetParent) {
                    window.requestAnimationFrame(tryScroll);
                    return;
                }
                const nodeRect = node.getBoundingClientRect();
                if (nodeRect.height === 0 || nodeRect.width === 0) {
                    window.requestAnimationFrame(tryScroll);
                    return;
                }
                let offset = 0;
                let current = node;
                while (current && current !== container) {
                    offset += current.offsetTop;
                    current = current.offsetParent;
                }
                if (current === container) {
                    const maxScrollTop = Math.max(0, container.scrollHeight - container.clientHeight);
                    const nextTop = Math.min(offset, maxScrollTop);
                    container.scrollTo({
                        top: nextTop,
                        behavior: 'smooth',
                    });
                } else if (typeof node.scrollIntoView === 'function') {
                    node.scrollIntoView({block: 'start', behavior: 'smooth'});
                } else {
                    const containerRect = container.getBoundingClientRect();
                    const fallbackOffset = nodeRect.top - containerRect.top;
                    const maxScrollTop = Math.max(0, container.scrollHeight - container.clientHeight);
                    const nextTop = Math.min(container.scrollTop + fallbackOffset, maxScrollTop);
                    container.scrollTo({
                        top: nextTop,
                        behavior: 'smooth',
                    });
                }
                setPendingScrollId('');
                return;
            }
            if (performance.now() - startedAt < 2000) {
                window.requestAnimationFrame(tryScroll);
                return;
            }
            setPendingScrollId('');
        };
        window.requestAnimationFrame(tryScroll);
    }, []);

    useEffect(() => {
        const prevTokens = prevSearchTokensRef.current;
        prevSearchTokensRef.current = searchTokens.length;
        if (searchTokens.length > 0) {
            clearSearchRequestedRef.current = false;
            return;
        }
        if (isSearchActive) {
            return;
        }
        if (prevTokens > 0 && selectedId && clearSearchRequestedRef.current) {
            clearSearchRequestedRef.current = false;
            expandPathToItem(selectedId, {suppressAnimation: true});
            const selectedUid = findNodeUidById(tree, selectedId);
            setPendingScrollId(selectedUid || '');
            return;
        }
        if (clearSearchRequestedRef.current) {
            clearSearchRequestedRef.current = false;
        }
    }, [expandPathToItem, isSearchActive, searchTokens.length, selectedId]);

    useEffect(() => {
        if (!pendingScrollId || searchTokens.length > 0) {
            return;
        }
        scrollToNodeId(pendingScrollId);
    }, [pendingScrollId, scrollToNodeId, searchTokens.length]);

    return (
        <div
            className={`app ${isMobileLayout ? 'is-mobile' : 'is-desktop'} ${
                isSidebarOpen ? 'sidebar-open' : 'sidebar-collapsed'
            }`}
        >
            <aside className="sidebar">
                <div className="sidebar-header">
                    <div>
                        <div className="app-title">Catalog Explorer</div>
                        <div className="app-subtitle">Current State</div>
                    </div>
                </div>
                {error && <div className="error">{error}</div>}
                {!error && tree.length > 0 && (
                    <div className="tree-controls">
                        <button type="button" title="Collapse all dependencies" onClick={handleCollapseAll}>Collapse
                            all
                        </button>
                        <button type="button" title="Expand to all dependencies" onClick={handleExpandAll}>Expand all
                        </button>
                    </div>
                )}
                {!error && tree.length > 0 && (
                    <div className="tree-search">
                        <span className="search-icon" aria-hidden="true">🔍</span>
                        <input
                            type="text"
                            placeholder="Search item..."
                            value={searchQuery}
                            onChange={(event) => {
                                const nextValue = event.target.value;
                                setSearchQuery(nextValue);
                                if (!isSearchActive && nextValue.trim()) {
                                    setIsSearchActive(true);
                                }
                            }}
                            aria-label="Search items by title, key, or type"
                        />
                        {(searchQuery || isSearchActive) && (
                            <button
                                type="button"
                                className="search-clear"
                                aria-label="Clear search"
                                onClick={handleClearSearch}
                            >
                                ✕
                            </button>
                        )}
                    </div>
                )}
                {!error && tree.length === 0 && (
                    <div className="empty">Catalog is empty. Add items to catalog.yaml.</div>
                )}
                {isSearchActive ? (
                    <div className="search-results">
                        <div className="search-results-header">
                            Found {searchResults.length} item{searchResults.length === 1 ? '' : 's'}
                        </div>
                        {searchResults.length === 0 ? (
                            <div className="empty">No items match the current search.</div>
                        ) : (
                            <div className="catalog-tree">
                                {searchResults.map(({item}) => (
                                    <div key={item.id} className="catalog-item node-leaf">
                                        <div
                                            className={`node-row ${selectedId === item.id ? 'is-selected' : ''}`}
                                            data-node-id={item.id}
                                        >
                                            <div className="node-main">
                                                <span className="node-toggle-spacer" aria-hidden="true"/>
                                                <div
                                                    className="node-label"
                                                    onClick={(event) => {
                                                        event.stopPropagation();
                                                        handleSelectItemById(item.id);
                                                        expandPathToItem(item.id, {suppressAnimation: true});
                                                    }}
                                                    role="button"
                                                    tabIndex={0}
                                                    onKeyDown={(event) => {
                                                        if (event.key === 'Enter' || event.key === ' ') {
                                                            event.preventDefault();
                                                            handleSelectItemById(item.id);
                                                            expandPathToItem(item.id, {suppressAnimation: true});
                                                        }
                                                    }}
                                                >
                          <span className="node-heading">
                            <span
                                className={`status-indicator status-${itemStatuses[item.id] || 'unknown'}`}
                                aria-label={`Status: ${(itemStatuses[item.id] || 'unknown').toUpperCase()}${
                                    lastUpdated ? ` (at ${lastUpdated})` : ''
                                }`}
                                title={`Status: ${(itemStatuses[item.id] || 'unknown').toUpperCase()}${
                                    lastUpdated ? ` (at ${lastUpdated})` : ''
                                }`}
                            />
                              {item.name && <span className="node-name">{item.name}</span>}
                          </span>
                                                    {(item.id || item.type) && (
                                                        <span className="node-identity">
                              {item.id}
                                                            {item.type ? ` (${item.type})` : ''}
                            </span>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                ) : (
                    <>
                        <div className="catalog-tree" ref={catalogTreeRef}>
                            {filteredTree.map((node) => (
                                <CatalogNode
                                    key={node.item.id}
                                    node={node}
                                    selectedId={selectedId}
                                    onSelect={handleSelectItem}
                                    expandedIds={expandedIds}
                                    onToggleNode={handleToggleNode}
                                    disableAnimation={disableTreeAnimation}
                                    grafanaBaseUrl={grafanaBaseUrl}
                                    theme={theme}
                                    status={itemStatuses[node.item.id] || 'unknown'}
                                    statuses={itemStatuses}
                                    lastUpdated={lastUpdated}
                                />
                            ))}
                        </div>
                        {!error && tree.length > 0 && filteredTree.length === 0 && (
                            <div className="empty">No services match the current search.</div>
                        )}
                    </>
                )}
            </aside>
            <button
                type="button"
                aria-label={isSidebarOpen ? 'Collapse catalog panel' : 'Open catalog panel'}
                className="hamburger-toggle sidebar-toggle"
                onClick={handleToggleSidebar}
            >
                ☰
            </button>
            {isMobileLayout && isSidebarOpen && (
                <button
                    type="button"
                    className="sidebar-backdrop"
                    onClick={() => setIsMobileSidebarOpen(false)}
                    aria-label="Close catalog panel"
                />
            )}
            <main className="content" ref={contentRef}>
                <header
                    className={`content-header ${
                        shouldOffsetContentHeader ? 'content-header-with-toggle' : ''
                    }`}
                    ref={headerRef}
                >
                    <div className="content-header-main">
                        <div className="content-title">
                            {selectedItem && (
                                <span
                                    className={`status-indicator status-${selectedStatus}`}
                                    aria-label={`Status: ${selectedStatus.toUpperCase()}${
                                        lastUpdated ? ` (at ${lastUpdated})` : ''
                                    }`}
                                    title={`Status: ${selectedStatus.toUpperCase()}${
                                        lastUpdated ? ` (at ${lastUpdated})` : ''
                                    }`}
                                />
                            )}
                            <span className="content-title-text">
                                {selectedItem ? selectedItem.name || selectedItem.id : 'Select an item'}
                            </span>
                            {selectedItem && selectedStatus !== 'up' && (
                                <span className={`content-status-label status-${selectedStatus}`}>
                                    {selectedStatus.toUpperCase()}
                                </span>
                            )}
                        </div>
                    </div>
                    <button
                        type="button"
                        className="theme-toggle"
                        onClick={() => setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'))}
                    >
                        <span className="theme-toggle-icon" aria-hidden="true">
                            {theme === 'dark' ? '💡' : '🌙'}
                        </span>
                        <span className="theme-toggle-text">
                            {theme === 'dark' ? 'Go light' : 'Go dark'}
                        </span>
                    </button>
                </header>
                {!selectedItem ? (
                    <div className="empty">Select a catalog item to view dashboards.</div>
                ) : (
                    <>
                        {selectedStatus !== 'up' && affectedItems.length > 0 && (
                            <section className={`affected-panel ${isAffectedOpen ? 'is-open' : ''}`}>
                                <button
                                    type="button"
                                    className={`affected-toggle ${isAffectedOpen ? 'is-open' : ''}`}
                                    onClick={() => setIsAffectedOpen((prev) => !prev)}
                                    aria-expanded={isAffectedOpen}
                                >
                                    <span
                                        className={`affected-chevron ${isAffectedOpen ? 'is-open' : ''}`}
                                        aria-hidden="true"
                                    >
                                        ›
                                    </span>
                                    <span className={`affected-summary ${isAffectedOpen ? 'is-open' : ''}`}>
                                        Affected by {affectedItems.length} item
                                        {affectedItems.length === 1 ? '' : 's'}
                                        {!isAffectedOpen && affectedItems.length > 0
                                            ? `: ${affectedItems.map((entry) => entry.name).join(', ')}`
                                            : ''}
                                    </span>
                                </button>
                                {isAffectedOpen && (
                                    <ul className="affected-list">
                                        {affectedItems.length === 0 ? (
                                            <li className="affected-empty">
                                                No degraded dependent services detected.
                                            </li>
                                        ) : (
                                            affectedItems.map((entry) => (
                                                <li key={entry.id} className="affected-item">
                                                    <span
                                                        className={`status-indicator status-${entry.status}`}
                                                        aria-label={`Status: ${entry.status.toUpperCase()}`}
                                                        title={`Status: ${entry.status.toUpperCase()}`}
                                                    />
                                                    <div className="affected-meta">
                                                        <div className="affected-row">
                                                            <span className="affected-name" title={entry.name}>
                                                                {entry.name}
                                                            </span>
                                                        </div>
                                                    </div>
                                                </li>
                                            ))
                                        )}
                                    </ul>
                                )}
                            </section>
                        )}
                        {selectedChecks.length > 0 && (
                            <section className={`affected-panel ${isChecksOpen ? 'is-open' : ''}`}>
                                <button
                                    type="button"
                                    className={`affected-toggle ${isChecksOpen ? 'is-open' : ''}`}
                                    onClick={() => setIsChecksOpen((prev) => !prev)}
                                    aria-expanded={isChecksOpen}
                                >
                                    <span
                                        className={`affected-chevron ${isChecksOpen ? 'is-open' : ''}`}
                                        aria-hidden="true"
                                    >
                                        ›
                                    </span>
                                    <span className={`affected-summary ${isChecksOpen ? 'is-open' : ''}`}>
                                        {checkSummary.text}
                                    </span>
                                </button>
                                {isChecksOpen && (
                                    <ul className="affected-list">
                                        {selectedChecks.map((entry) => (
                                            <li key={entry.id} className="affected-item">
                                                <span
                                                    className={`status-indicator status-${entry.status}`}
                                                    aria-label={`Status: ${entry.status.toUpperCase()}`}
                                                    title={`Status: ${entry.status.toUpperCase()}`}
                                                />
                                                <div className="affected-meta">
                                                    <div className="affected-row">
                                                        <span className="affected-name" title={entry.id}>
                                                            {entry.id}
                                                        </span>
                                                    </div>
                                                </div>
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </section>
                        )}
                        <div className="grafana-grid">
                            <section
                                className="grafana-panel"
                                style={grafanaHeight ? {height: `${grafanaHeight}px`} : undefined}
                            >
                            <iframe
                                title="State Timeline"
                                ref={grafanaIframeRef}
                                onLoad={handleGrafanaLoad}
                                src={buildDashboardUrl(
                                    grafanaBaseUrl,
                                    DASHBOARDS.timeline.uid,
                                    DASHBOARDS.timeline.slug,
                                    selectedItem.id,
                                    theme,
                                    DASHBOARDS.timeline.panelId,
                                )}
                            />
                            </section>
                        </div>
                    </>
                )}
            </main>
        </div>
    );
}
