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

    const toNode = (itemId, visited = new Set()) => {
        if (visited.has(itemId)) {
            return null;
        }
        visited.add(itemId);
        const item = itemMap.get(itemId);
        if (!item) {
            return null;
        }
        const children = sortNodesByName(
            (childrenMap.get(itemId) || [])
                .map((childId) => toNode(childId, new Set(visited)))
                .filter(Boolean),
        );
        return {item, children};
    };

    return rootItems.map((item) => toNode(item.id)).filter(Boolean);
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

const resolveBasePath = () => new URL('.', window.location.href).pathname;

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
    const [isChildrenVisible, setIsChildrenVisible] = useState(isExpanded);
    const [isChildrenExpanded, setIsChildrenExpanded] = useState(isExpanded);
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

    useEffect(() => {
        let animationFrameId;
        let nestedAnimationFrameId;

        if (disableAnimation) {
            setIsChildrenVisible(isExpanded);
            setIsChildrenExpanded(isExpanded);
            return () => {
                if (animationFrameId) {
                    window.cancelAnimationFrame(animationFrameId);
                }
                if (nestedAnimationFrameId) {
                    window.cancelAnimationFrame(nestedAnimationFrameId);
                }
            };
        }

        if (isExpanded) {
            setIsChildrenVisible(true);
            animationFrameId = window.requestAnimationFrame(() => {
                nestedAnimationFrameId = window.requestAnimationFrame(() => {
                    setIsChildrenExpanded(true);
                });
            });
        } else {
            setIsChildrenExpanded(false);
        }

        return () => {
            if (animationFrameId) {
                window.cancelAnimationFrame(animationFrameId);
            }
            if (nestedAnimationFrameId) {
                window.cancelAnimationFrame(nestedAnimationFrameId);
            }
        };
    }, [disableAnimation, isExpanded]);

    const row = (
        <div
            className={`node-row ${selectedId === node.item.id ? 'is-selected' : ''}`}
            data-node-id={node.item.id}
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
                        {isExpanded ? 'v' : '>'}
                    </button>
                ) : (
                    <span className="node-toggle-spacer" aria-hidden="true"/>
                )}
                <div
                    className="node-label"
                    onClick={(event) => {
                        event.stopPropagation();
                        onSelect(node.item.id);
                    }}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault();
                            onSelect(node.item.id);
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
        return <li className="node-leaf">{row}</li>;
    }

    return (
        <li>
            {row}
            {isChildrenVisible && (
                <ul
                    className={`node-children ${isChildrenExpanded ? 'is-expanded' : ''}`}
                    onTransitionEnd={(event) => {
                        if (event.target !== event.currentTarget) {
                            return;
                        }
                        if (!isExpanded) {
                            setIsChildrenVisible(false);
                        }
                    }}
                >
                    {node.children.map((child) => (
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
                </ul>
            )}
        </li>
    );
};

export default function App() {
    const [catalog, setCatalog] = useState({items: [], dependencies: []});
    const [selectedId, setSelectedId] = useState('');
    const [error, setError] = useState('');
    const [theme, setTheme] = useState(getInitialTheme);
    const [expandedIds, setExpandedIds] = useState(() => new Set());
    const [itemStatuses, setItemStatuses] = useState({});
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
    const prevSearchTokensRef = useRef(0);
    const clearSearchRequestedRef = useRef(false);
    const catalogTreeRef = useRef(null);
    const grafanaIframeRef = useRef(null);
    const grafanaEscHandlerRef = useRef(null);

    const grafanaBaseUrl = useMemo(resolveGrafanaBaseUrl, []);
    const prometheusBaseUrl = useMemo(resolvePrometheusBaseUrl, []);

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
                    throw new Error(`Failed to load catalog: ${response.status}`);
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
                const response = await fetch(
                    `${prometheusBaseUrl}/api/v1/query?query=${encodeURIComponent('catalog_item_state')}`,
                );
                if (!response.ok) {
                    throw new Error(`Failed to load Prometheus data: ${response.status}`);
                }
                const contentType = response.headers.get('content-type') || '';
                if (!contentType.includes('application/json')) {
                    return;
                }
                const payload = await response.json();
                const results = payload?.data?.result ?? [];
                const nextStatuses = {};
                results.forEach((entry) => {
                    const itemId = entry?.metric?.item_id;
                    if (!itemId) {
                        return;
                    }
                    const value = Number.parseFloat(entry?.value?.[1]);
                    let status = 'unknown';
                    if (Number.isFinite(value)) {
                        if (value >= 0.9) {
                            status = 'up';
                        } else if (value <= 0.1) {
                            status = 'down';
                        }
                    }
                    nextStatuses[itemId] = status;
                });
                if (!cancelled) {
                    setItemStatuses(nextStatuses);
                    setLastUpdated(new Date().toLocaleTimeString());
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

    const expandPathToItem = useCallback((itemId, {suppressAnimation} = {}) => {
        const path = findNodePath(tree, itemId);
        const ancestors = path ? path.slice(0, -1) : [];
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
    const isSidebarOpen = isMobileLayout ? isMobileSidebarOpen : isDesktopSidebarOpen;
    const shouldOffsetContentHeader = isMobileLayout || !isSidebarOpen;

    const handleToggleSidebar = useCallback(() => {
        if (isMobileLayout) {
            setIsMobileSidebarOpen((prev) => !prev);
            return;
        }
        setIsDesktopSidebarOpen((prev) => !prev);
    }, [isMobileLayout]);

    const handleSelectItem = useCallback((itemId) => {
        setSelectedId(itemId);
        setIsMobileSidebarOpen(false);
    }, []);

    const handleClearSearch = useCallback(() => {
        clearSearchRequestedRef.current = true;
        setSearchQuery('');
        setIsSearchActive(false);
    }, []);

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
                    container.scrollTo({
                        top: offset,
                        behavior: 'smooth',
                    });
                } else if (typeof node.scrollIntoView === 'function') {
                    node.scrollIntoView({block: 'start', behavior: 'smooth'});
                } else {
                    const containerRect = container.getBoundingClientRect();
                    const fallbackOffset = nodeRect.top - containerRect.top;
                    container.scrollTo({
                        top: container.scrollTop + fallbackOffset,
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
            setPendingScrollId(selectedId);
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
                            onKeyDown={(event) => {
                                if (event.key === 'Escape' || event.keyCode === 27) {
                                    event.preventDefault();
                                    if (isSearchActive) {
                                        handleClearSearch();
                                    }
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
                            <ul className="catalog-tree">
                                {searchResults.map(({item}) => (
                                    <li key={item.id} className="node-leaf">
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
                                                        handleSelectItem(item.id);
                                                        expandPathToItem(item.id, {suppressAnimation: true});
                                                    }}
                                                    role="button"
                                                    tabIndex={0}
                                                    onKeyDown={(event) => {
                                                        if (event.key === 'Enter' || event.key === ' ') {
                                                            event.preventDefault();
                                                            handleSelectItem(item.id);
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
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                ) : (
                    <>
                        <ul className="catalog-tree" ref={catalogTreeRef}>
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
                        </ul>
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
            <main className="content">
                <header
                    className={`content-header ${
                        shouldOffsetContentHeader ? 'content-header-with-toggle' : ''
                    }`}
                >
                    <div className="content-header-main">
                        <div className="content-title">
                            {selectedItem ? selectedItem.name || selectedItem.id : 'Select an item'}
                        </div>
                        <div className="content-subtitle">
                            State Timeline
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
                    <div className="grafana-grid">
                        <section className="grafana-panel">
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
                )}
            </main>
        </div>
    );
}
