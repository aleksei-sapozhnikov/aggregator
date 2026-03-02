import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import SidebarPanel from './components/SidebarPanel';
import DetailsPanel from './components/DetailsPanel';
import AboutModal from './components/AboutModal';
import {
    buildCatalogTree,
    buildItemPathname,
    buildItemRouteHref,
    buildNameWordVocabulary,
    buildSearchAutocompleteOptions,
    buildServicePath,
    collectDescendantIds,
    collectExpandableIds,
    filterCatalogTree,
    findNodeById,
    findNodeByPath,
    findNodePath,
    findNodeUidById,
    normalizeSearchText,
    rankSearchResults,
    readLocationRouteContext,
    resolveNodeFromLocation,
} from './shared/catalogUtils';
import {
    buildDashboardUrl,
    buildGrafanaFrameUrl,
    compareHealthStatus,
    DASHBOARDS,
    fetchPrometheusStatuses,
    getInitialTheme,
    loadCatalog,
    resolveBasePath,
    resolveBaseUrl,
    resolveGrafanaBaseUrl,
    resolvePrometheusBaseUrl,
    resolveSidebarTitle,
} from './services/aggregatorApi';
/** @typedef {import('./shared/types').CatalogDependency} CatalogDependency */
/** @typedef {import('./shared/types').CatalogItem} CatalogItem */
/** @typedef {import('./shared/types').HealthStatus} HealthStatus */
/** @typedef {import('./shared/types').ItemSignal} ItemSignal */

const MOBILE_BREAKPOINT = 1100;
const TREE_SCROLL_LONG_DISTANCE_PX = 600;
const TREE_SCROLL_SMOOTH_SEGMENT_PX = 360;
/** @type {{items: CatalogItem[], dependencies: CatalogDependency[]}} */
const EMPTY_CATALOG = {items: [], dependencies: []};

/**
 * @file Main React application orchestrator for aggregator-ui.
 */

/**
 * Application orchestrator.
 * Owns cross-cutting state (selection, routing, polling, theme, responsive shell state)
 * and wires large UI blocks (SidebarPanel, DetailsPanel, AboutModal).
 */
export default function App() {
    const sidebarTitle = resolveSidebarTitle();
    const [catalog, setCatalog] = useState(EMPTY_CATALOG);
    const [selectedId, setSelectedId] = useState('');
    const [selectedPath, setSelectedPath] = useState([]);
    const [error, setError] = useState('');
    const [theme, setTheme] = useState(getInitialTheme);
    const initialFrameThemeRef = useRef(theme);
    const [expandedIds, setExpandedIds] = useState(() => new Set());
    const expandedIdsRef = useRef(expandedIds);
    /** @type {[Record<string, HealthStatus>, import('react').Dispatch<import('react').SetStateAction<Record<string, HealthStatus>>>]} */
    const [itemStatuses, setItemStatuses] = useState({});
    /** @type {[Record<string, ItemSignal[]>, import('react').Dispatch<import('react').SetStateAction<Record<string, ItemSignal[]>>>]} */
    const [itemSignals, setItemSignals] = useState({});
    const [lastUpdated, setLastUpdated] = useState('');
    const [isMobileLayout, setIsMobileLayout] = useState(
        () => window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT}px)`).matches,
    );
    const [isDesktopSidebarOpen, setIsDesktopSidebarOpen] = useState(true);
    const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
    const [isSearchActive, setIsSearchActive] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [pendingScrollId, setPendingScrollId] = useState('');
    const [isFailingSignalsOpen, setIsFailingSignalsOpen] = useState(false);
    const [isPassingSignalsOpen, setIsPassingSignalsOpen] = useState(true);
    const [isGrafanaOpen, setIsGrafanaOpen] = useState(true);
    const [isAboutOpen, setIsAboutOpen] = useState(false);
    const [isTitlePrimaryBelowControls, setIsTitlePrimaryBelowControls] = useState(false);
    const failingSignalsAutoOpenRef = useRef(true);
    const [grafanaHeight, setGrafanaHeight] = useState(0);
    const prevSearchTokensRef = useRef(0);
    const clearSearchRequestedRef = useRef(false);
    const catalogTreeRef = useRef(null);
    const grafanaIframeRef = useRef(null);
    const contentRef = useRef(null);
    const headerRef = useRef(null);
    const headerActionsRef = useRef(null);
    const contentTitlePrimaryRef = useRef(null);
    const lastHistoryUrlRef = useRef(window.location.href);
    const lastHistoryKeyRef = useRef('');
    const pendingGrafanaSrcRef = useRef('');
    const grafanaFrameReadyRef = useRef(false);

    const grafanaBaseUrl = useMemo(resolveGrafanaBaseUrl, []);
    const prometheusBaseUrl = useMemo(resolvePrometheusBaseUrl, []);
    const basePath = useMemo(resolveBasePath, []);
    const appBaseUrl = useMemo(() => resolveBaseUrl().replace(/\/$/, ''), []);

    /**
     * Pushes/replaces browser history for an item route while deduplicating no-op updates.
     */
    const updateHistoryForRoute = useCallback((itemId, pathIds, {replace} = {}) => {
        if (!itemId) {
            return;
        }
        const normalizedPath = Array.isArray(pathIds) ? pathIds : [];
        const url = new URL(window.location.href);
        url.pathname = buildItemPathname(basePath, itemId);
        url.search = '';
        if (normalizedPath.length > 0) {
            url.searchParams.set('path', buildServicePath(normalizedPath));
        }
        const currentPathKey = Array.isArray(window.history.state?.path)
            ? window.history.state.path.join('/')
            : '';
        const targetPathKey = normalizedPath.join('/');
        const historyKey = `${itemId}::${targetPathKey}`;
        const nextUrl = url.toString();

        if (window.history.state?.itemId === itemId && currentPathKey === targetPathKey) {
            return;
        }
        if (
            nextUrl === window.location.href ||
            nextUrl === lastHistoryUrlRef.current ||
            historyKey === lastHistoryKeyRef.current
        ) {
            return;
        }

        const nextState = {itemId, path: normalizedPath};
        if (replace) {
            window.history.replaceState(nextState, '', url);
        } else {
            window.history.pushState(nextState, '', url);
        }
        lastHistoryUrlRef.current = nextUrl;
        lastHistoryKeyRef.current = historyKey;
    }, [basePath]);

    /**
     * Updates route for an item id without preserving an explicit tree path.
     */
    const updateUrlForItemId = useCallback((itemId, {replace} = {}) => {
        updateHistoryForRoute(itemId, [], {replace});
    }, [updateHistoryForRoute]);

    /**
     * Updates route using the selected tree node and its resolved path.
     */
    const updateUrlForNode = useCallback((node, {replace} = {}) => {
        if (!node) {
            return;
        }
        updateHistoryForRoute(node.item.id, node.path || [], {replace});
    }, [updateHistoryForRoute]);

    /**
     * Normalizes route state after parsing browser location (same semantics, normalized path).
     */
    const normalizeUrlForRoute = useCallback((itemId, pathIds, {replace} = {}) => {
        updateHistoryForRoute(itemId, pathIds, {replace});
    }, [updateHistoryForRoute]);

    /**
     * Marks the Grafana wrapper iframe as ready and flushes pending theme/src messages.
     */
    const handleGrafanaLoad = useCallback(() => {
        const iframe = grafanaIframeRef.current;
        if (!iframe?.contentWindow) {
            return;
        }
        try {
            grafanaFrameReadyRef.current = true;
            iframe.contentWindow.postMessage(
                {type: 'set-frame-theme', theme},
                window.location.origin,
            );
            if (pendingGrafanaSrcRef.current) {
                iframe.contentWindow.postMessage(
                    {type: 'set-grafana-src', src: pendingGrafanaSrcRef.current},
                    window.location.origin,
                );
            }
        } catch (error) {
            // Ignore cross-origin access issues when Grafana is hosted elsewhere.
        }
    }, [theme]);

    useEffect(() => {
        document.body.dataset.theme = theme;
        localStorage.setItem('aggregator-ui-theme', theme);
    }, [theme]);

    /**
     * Keep the Grafana wrapper iframe in sync with the current app theme
     * after the wrapper page reports it is ready.
     */
    useEffect(() => {
        const iframe = grafanaIframeRef.current;
        if (!iframe?.contentWindow || !grafanaFrameReadyRef.current) {
            return;
        }
        iframe.contentWindow.postMessage(
            {type: 'set-frame-theme', theme},
            window.location.origin,
        );
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
        expandedIdsRef.current = expandedIds;
    }, [expandedIds]);

    useEffect(() => {
        if (isMobileLayout) {
            setIsMobileSidebarOpen(false);
        }
    }, [isMobileLayout]);

    useEffect(() => {
        const loadInitialCatalog = async () => {
            try {
                const {items, dependencies} = await loadCatalog();
                setCatalog({items, dependencies});
                setSelectedId((prev) => prev || items[0]?.id || '');
            } catch (err) {
                setError(err.message);
            }
        };

        void loadInitialCatalog();
    }, []);

    useEffect(() => {
        if (!catalog.items.length) {
            return undefined;
        }

        let cancelled = false;

        const fetchStatuses = async () => {
            try {
                const next = await fetchPrometheusStatuses(prometheusBaseUrl);
                if (!cancelled) {
                    setItemStatuses(next.itemStatuses);
                    setItemSignals(next.itemSignals);
                    setLastUpdated(new Date().toLocaleTimeString());
                }
            } catch (err) {
                if (!cancelled) {
                    console.error(err);
                }
            }
        };

        void fetchStatuses();
        const interval = window.setInterval(() => {
            void fetchStatuses();
        }, 10000);
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
    const searchNameWordVocabulary = useMemo(
        () => buildNameWordVocabulary(catalog.items),
        [catalog.items],
    );
    const searchAutocompleteOptions = useMemo(
        () => buildSearchAutocompleteOptions(searchQuery, searchNameWordVocabulary),
        [searchQuery, searchNameWordVocabulary],
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

    /**
     * Expands ancestors for the selected item so it is visible in the tree.
     */
    const expandPathToItem = useCallback((itemId, {path} = {}) => {
        const resolvedPath = path && path.length ? path : findNodePath(tree, itemId);
        const ancestors = resolvedPath ? resolvedPath.slice(0, -1) : [];
        setExpandedIds(new Set(ancestors));
    }, [tree]);

    /**
     * Ensures ancestors in a known path are expanded without resetting other expanded branches.
     */
    const ensurePathExpanded = useCallback((pathIds) => {
        if (!Array.isArray(pathIds) || pathIds.length === 0) {
            return;
        }
        const ancestors = pathIds.slice(0, -1);
        if (ancestors.length === 0) {
            return;
        }
        setExpandedIds((prev) => {
            const next = new Set(prev);
            ancestors.forEach((id) => next.add(id));
            return next;
        });
    }, []);

    /**
     * Expands all nodes currently present in the tree.
     */
    const handleExpandAll = useCallback(() => {
        setExpandedIds(new Set(collectExpandableIds(tree)));
        if (!selectedId) {
            return;
        }
        const selectedUid = selectedPath.length > 0
            ? findNodeByPath(tree, selectedPath)?.uid || ''
            : findNodeUidById(tree, selectedId) || '';
        if (selectedUid) {
            setPendingScrollId(selectedUid);
        }
    }, [selectedId, selectedPath, tree]);

    /**
     * Collapses the full tree and resets the catalog scroll position to the top.
     */
    const handleCollapseAll = useCallback(() => {
        setExpandedIds(new Set());
        setPendingScrollId('');
        window.requestAnimationFrame(() => {
            catalogTreeRef.current?.scrollTo({
                top: 0,
                behavior: 'auto',
            });
        });
    }, []);

    const selectedNode = useMemo(() => {
        if (!selectedId) {
            return null;
        }
        if (selectedPath.length > 0) {
            const byPath = findNodeByPath(tree, selectedPath);
            if (byPath?.item?.id === selectedId) {
                return byPath;
            }
        }
        return findNodeById(tree, selectedId);
    }, [selectedId, selectedPath, tree]);
    const selectedItem = selectedNode?.item || itemMap.get(selectedId);
    const selectedStatus = selectedItem ? itemStatuses[selectedItem.id] || 'unknown' : 'unknown';
    const selectedTitleText = selectedItem ? selectedItem.name || selectedItem.id : 'Select an item';
    const selectedTitleMatch = selectedTitleText.match(/^(\S+)([\s\S]*)$/);
    const selectedTitleFirstWord = selectedTitleMatch?.[1] || selectedTitleText;
    const selectedTitleRest = selectedTitleMatch?.[2] || '';

    useEffect(() => {
        const measurePrimaryWidth = (element) => {
            const clone = element.cloneNode(true);
            clone.style.position = 'fixed';
            clone.style.left = '-99999px';
            clone.style.top = '-99999px';
            clone.style.visibility = 'hidden';
            clone.style.pointerEvents = 'none';
            clone.style.width = 'max-content';
            clone.style.maxWidth = 'none';
            clone.style.whiteSpace = 'nowrap';
            document.body.appendChild(clone);
            const width = clone.getBoundingClientRect().width;
            clone.remove();
            return width;
        };

        const updateTitlePrimaryPlacement = () => {
            if (!headerRef.current || !headerActionsRef.current || !contentTitlePrimaryRef.current) {
                setIsTitlePrimaryBelowControls(false);
                return;
            }

            const sidebarOpen = isMobileLayout ? isMobileSidebarOpen : isDesktopSidebarOpen;
            const shouldOffsetHeaderInline = isMobileLayout || !sidebarOpen;
            const inlineLeftOffset = shouldOffsetHeaderInline ? (isMobileLayout ? 52 : 56) : 0;
            const headerStyles = window.getComputedStyle(headerRef.current);
            const gap = Number.parseFloat(headerStyles.columnGap || headerStyles.gap) || 12;
            const actionsRectWidth = headerActionsRef.current.getBoundingClientRect().width;
            const actionsStyles = window.getComputedStyle(headerActionsRef.current);
            const actionsMarginLeft = Number.parseFloat(actionsStyles.marginLeft) || 0;
            const actionsMarginRight = Number.parseFloat(actionsStyles.marginRight) || 0;
            const actionsWidth = Math.ceil(actionsRectWidth + actionsMarginLeft + actionsMarginRight);
            const primaryWidth = Math.ceil(measurePrimaryWidth(contentTitlePrimaryRef.current));
            const availableInlineWidth = Math.max(
                0,
                headerRef.current.clientWidth - actionsWidth - gap - inlineLeftOffset,
            );
            const actionsRect = headerActionsRef.current.getBoundingClientRect();
            const primaryRect = contentTitlePrimaryRef.current.getBoundingClientRect();
            const primaryAlreadyBelowControls = primaryRect.top >= (actionsRect.bottom - 2);
            const shouldForceBelowByWidth = primaryWidth > availableInlineWidth + 6;
            const canReturnInlineByWidth = primaryWidth <= availableInlineWidth - 16;

            setIsTitlePrimaryBelowControls((prev) => {
                if (prev) {
                    return !canReturnInlineByWidth;
                }
                return shouldForceBelowByWidth || primaryAlreadyBelowControls;
            });
        };

        updateTitlePrimaryPlacement();

        window.addEventListener('resize', updateTitlePrimaryPlacement);
        let observer;
        if (window.ResizeObserver) {
            observer = new ResizeObserver(updateTitlePrimaryPlacement);
            [headerRef.current, headerActionsRef.current, contentTitlePrimaryRef.current]
                .filter(Boolean)
                .forEach((element) => observer.observe(element));
        }

        return () => {
            window.removeEventListener('resize', updateTitlePrimaryPlacement);
            if (observer) {
                observer.disconnect();
            }
        };
    }, [
        isMobileLayout,
        isMobileSidebarOpen,
        isDesktopSidebarOpen,
        selectedId,
        selectedTitleFirstWord,
    ]);
    const selectedSignals = useMemo(() => {
        if (!selectedItem) {
            return [];
        }
        const signals = itemSignals[selectedItem.id] || [];
        return [...signals].sort((a, b) => {
            const statusCompare = compareHealthStatus(a.status, b.status);
            if (statusCompare !== 0) {
                return statusCompare;
            }
            return (a.name || a.id).localeCompare(b.name || b.id) || a.id.localeCompare(b.id);
        });
    }, [itemSignals, selectedItem]);

    const selectedFailingSignals = useMemo(
        () => selectedSignals.filter((signal) => signal.status === 'down'),
        [selectedSignals],
    );
    const selectedPassingSignals = useMemo(
        () => selectedSignals.filter((signal) => signal.status === 'up'),
        [selectedSignals],
    );
    const hasOwnHealthSignals = selectedSignals.length > 0;
    const failingDependencyNodes = useMemo(() => {
        if (!selectedNode) {
            return [];
        }
        const result = [];
        const visit = (children) => {
            children.forEach((child) => {
                result.push(child);
                visit(child.children);
            });
        };
        visit(selectedNode.children);
        return result;
    }, [selectedNode]);
    const failingDependencies = useMemo(() => {
        const dependencySources = new Set(catalog.dependencies.map((dep) => dep.sourceId));
        const seen = new Set();
        const result = [];
        failingDependencyNodes.forEach((dependencyNode) => {
            const dependencyId = dependencyNode.item.id;
            if (seen.has(dependencyId)) {
                return;
            }
            seen.add(dependencyId);
            const dependencyStatus = itemStatuses[dependencyId] || 'unknown';
            const hasOwnDependencies = dependencySources.has(dependencyId);
            const failingSignals = (itemSignals[dependencyId] || [])
                .filter((signal) => signal.status === 'down')
                .sort((a, b) => {
                    const statusCompare = compareHealthStatus(a.status, b.status);
                    if (statusCompare !== 0) {
                        return statusCompare;
                    }
                    return (a.name || a.id).localeCompare(b.name || b.id) || a.id.localeCompare(b.id);
                });
            const shouldIncludeLeafNonUp = !hasOwnDependencies && dependencyStatus !== 'up';
            if (failingSignals.length === 0 && !shouldIncludeLeafNonUp) {
                return;
            }
            const item = itemMap.get(dependencyId);
            result.push({
                id: dependencyId,
                name: item?.name || dependencyId,
                path: dependencyNode.path || [dependencyId],
                status: dependencyStatus,
                failingSignals,
                failingCountContribution: 1,
            });
        });
        return result.sort((a, b) => a.name.localeCompare(b.name));
    }, [catalog.dependencies, failingDependencyNodes, itemMap, itemSignals, itemStatuses]);
    const failingSignalsCount = useMemo(
        () =>
            selectedFailingSignals.length +
            failingDependencies.reduce((sum, entry) => sum + entry.failingCountContribution, 0),
        [failingDependencies, selectedFailingSignals.length],
    );
    const passingSignalsCount = selectedPassingSignals.length;
    const hasFailingSignals = failingSignalsCount > 0;
    const isSidebarOpen = isMobileLayout ? isMobileSidebarOpen : isDesktopSidebarOpen;
    const shouldOffsetContentHeader = isMobileLayout || !isSidebarOpen;
    const homeHref = basePath || '/';
    const homeIconSrc = `${basePath || '/'}logo.svg`;
    const iconSpriteHref = `${basePath || '/'}icons.svg`;
    const searchSuggestionsListId = 'item-search-suggestions';

    /**
     * Toggles sidebar visibility for desktop and mobile layouts.
     */
    const handleToggleSidebar = useCallback(() => {
        if (isMobileLayout) {
            setIsMobileSidebarOpen((prev) => !prev);
            return;
        }
        setIsDesktopSidebarOpen((prev) => !prev);
    }, [isMobileLayout]);

    /**
     * Selects a node from the tree and updates route with resolved path information.
     */
    const handleSelectItem = useCallback((node) => {
        setSelectedId(node.item.id);
        setSelectedPath(node.path || [node.item.id]);
        setPendingScrollId(node.uid);
        setIsMobileSidebarOpen(false);
        updateUrlForNode(node);
    }, [updateUrlForNode]);

    /**
     * Selects an item by id, using a resolved node path when available.
     */
    const handleSelectItemById = useCallback((itemId) => {
        setSelectedId(itemId);
        const selectedNode = findNodeById(tree, itemId);
        if (selectedNode) {
            setSelectedPath(selectedNode.path || [itemId]);
            setPendingScrollId(selectedNode.uid);
            updateUrlForNode(selectedNode);
        } else {
            setSelectedPath([]);
            const selectedUid = findNodeUidById(tree, itemId);
            setPendingScrollId(selectedUid || '');
            updateUrlForItemId(itemId);
        }
        setIsMobileSidebarOpen(false);
    }, [tree, updateUrlForItemId, updateUrlForNode]);

    /**
     * Selects an item by id and writes a pathless route (used by dependent item links).
     */
    const handleSelectItemByIdNoPath = useCallback((itemId) => {
        const resolvedPath = findNodePath(tree, itemId) || [];
        setSelectedId(itemId);
        setSelectedPath(resolvedPath);
        const selectedUid = findNodeUidById(tree, itemId);
        setPendingScrollId(selectedUid || '');
        setIsMobileSidebarOpen(false);
        expandPathToItem(itemId, {path: resolvedPath});
        updateUrlForItemId(itemId);
    }, [expandPathToItem, tree, updateUrlForItemId]);

    /**
     * Selects an item by an exact tree path to preserve duplicate-id branch context.
     */
    const handleSelectItemByPath = useCallback((pathIds) => {
        const normalizedPath = Array.isArray(pathIds) ? pathIds : [];
        const itemId = normalizedPath[normalizedPath.length - 1] || '';
        if (!itemId) {
            return;
        }
        setSelectedId(itemId);
        setSelectedPath(normalizedPath);
        const selectedNode = findNodeByPath(tree, normalizedPath);
        if (selectedNode) {
            setPendingScrollId(selectedNode.uid);
            setIsMobileSidebarOpen(false);
            ensurePathExpanded(selectedNode.path);
            updateUrlForNode(selectedNode);
            return;
        }
        const selectedUid = findNodeUidById(tree, itemId);
        setPendingScrollId(selectedUid || '');
        setIsMobileSidebarOpen(false);
        ensurePathExpanded(normalizedPath);
        normalizeUrlForRoute(itemId, normalizedPath);
    }, [ensurePathExpanded, normalizeUrlForRoute, tree, updateUrlForNode]);

    /**
     * Builds an item link under the current base path.
     */
    const buildItemLink = useCallback((itemId, pathIds = []) => {
        return buildItemRouteHref(basePath, itemId, pathIds);
    }, [basePath]);

    const grafanaFrameUrl = useMemo(
        () => buildGrafanaFrameUrl({initialTheme: initialFrameThemeRef.current}),
        [],
    );

    /**
     * Clears search text and exits search-results mode.
     */
    const handleClearSearch = useCallback(() => {
        clearSearchRequestedRef.current = true;
        setSearchQuery('');
        setIsSearchActive(false);
    }, []);

    useEffect(() => {
        const handleGrafanaItemLinkClick = (event) => {
            if (event.origin !== window.location.origin) {
                return;
            }
            if (event.data?.type !== 'grafana-item-link-click') {
                return;
            }
            const itemId = typeof event.data.itemId === 'string' ? event.data.itemId : '';
            if (!itemId) {
                return;
            }
            if (itemMap.has(itemId)) {
                handleSelectItemByIdNoPath(itemId);
                return;
            }
            const href = typeof event.data.href === 'string' ? event.data.href : '';
            if (href) {
                window.location.assign(href);
            }
        };

        window.addEventListener('message', handleGrafanaItemLinkClick);
        return () => {
            window.removeEventListener('message', handleGrafanaItemLinkClick);
        };
    }, [handleSelectItemByIdNoPath, itemMap]);

    /**
     * Sync selected item with browser URL and handle browser back/forward navigation.
     * Also normalizes invalid/missing route states to the closest resolvable node.
     */
    useEffect(() => {
        if (!tree.length) {
            return undefined;
        }
        const applySelectionFromLocation = (options = {}) => {
            const {
                normalize = true,
                preserveExpansion = false,
            } = options;
            const routeContext = readLocationRouteContext(basePath);
            const resolved = resolveNodeFromLocation(tree, basePath);
            if (!resolved) {
                if (normalize && routeContext.hasRouteId) {
                    normalizeUrlForRoute(routeContext.routeId, routeContext.pathIds, {replace: true});
                    return;
                }
                if (!routeContext.hasPathParam) {
                    const fallbackNode = tree[0] || null;
                    const fallbackId = fallbackNode?.item?.id || '';
                    setSelectedId(fallbackId);
                    setSelectedPath(fallbackNode?.path || (fallbackId ? [fallbackId] : []));
                    setPendingScrollId(fallbackNode?.uid || '');
                    setIsMobileSidebarOpen(false);
                    if (normalize && fallbackId) {
                        updateUrlForNode(fallbackNode, {replace: true});
                    }
                }
                return;
            }
            const {node} = resolved;
            setSelectedId(node.item.id);
            setSelectedPath(node.path || [node.item.id]);
            setPendingScrollId(node.uid);
            if (!preserveExpansion) {
                setIsMobileSidebarOpen(false);
                expandPathToItem(node.item.id, {path: node.path});
            } else {
                const ancestorIds = node.path?.slice(0, -1) || [];
                const needsExpand = ancestorIds.some((id) => !expandedIdsRef.current.has(id));
                if (needsExpand) {
                    ensurePathExpanded(node.path);
                }
            }
            if (normalize && (routeContext.hasRouteId || routeContext.hasPathParam)) {
                updateUrlForNode(node, {replace: true});
            }
        };

        applySelectionFromLocation({normalize: true});

        const handlePopState = () => {
            lastHistoryUrlRef.current = window.location.href;
            if (window.history.state?.itemId) {
                const stateItemId = window.history.state.itemId;
                const statePath = Array.isArray(window.history.state.path)
                    ? window.history.state.path
                    : [];
                lastHistoryKeyRef.current = `${stateItemId}::${statePath.join('/')}`;
            } else {
                lastHistoryKeyRef.current = '';
            }
            applySelectionFromLocation({normalize: false, preserveExpansion: true});
        };
        window.addEventListener('popstate', handlePopState);
        return () => {
            window.removeEventListener('popstate', handlePopState);
        };
    }, [
        basePath,
        ensurePathExpanded,
        expandPathToItem,
        normalizeUrlForRoute,
        tree,
        updateUrlForItemId,
        updateUrlForNode,
    ]);

    useEffect(() => {
        setIsFailingSignalsOpen(false);
        failingSignalsAutoOpenRef.current = true;
    }, [selectedId]);

    useEffect(() => {
        if (!selectedId) {
            return;
        }
        contentRef.current?.scrollTo({
            top: 0,
            behavior: 'auto',
        });
    }, [selectedId]);

    useEffect(() => {
        if (!isGrafanaOpen) {
            grafanaFrameReadyRef.current = false;
        }
    }, [isGrafanaOpen]);

    useEffect(() => {
        if (!failingSignalsAutoOpenRef.current) {
            return;
        }
        if (hasFailingSignals) {
            setIsFailingSignalsOpen(true);
            failingSignalsAutoOpenRef.current = false;
        }
    }, [hasFailingSignals, selectedId]);

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

    useEffect(() => {
        if (!isAboutOpen) {
            return undefined;
        }
        const handleKeyDown = (event) => {
            if (event.key === 'Escape' || event.keyCode === 27) {
                event.preventDefault();
                setIsAboutOpen(false);
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
        };
    }, [isAboutOpen]);

    /**
     * Scrolls the tree container to a node once it is rendered and measurable.
     */
    const scrollToNodeId = useCallback((targetId) => {
        const container = catalogTreeRef.current;
        if (!container) {
            return;
        }
        const animateScrollTo = (nextTop) => {
            const startTop = container.scrollTop;
            const targetTop = Math.max(0, nextTop);
            const distance = Math.abs(targetTop - startTop);
            if (distance < 1) {
                container.scrollTop = targetTop;
                return;
            }
            if (distance > TREE_SCROLL_LONG_DISTANCE_PX) {
                const direction = targetTop > startTop ? 1 : -1;
                const prejumpTop = direction > 0
                    ? Math.max(startTop, targetTop - TREE_SCROLL_SMOOTH_SEGMENT_PX)
                    : Math.min(startTop, targetTop + TREE_SCROLL_SMOOTH_SEGMENT_PX);
                if (Math.abs(prejumpTop - startTop) >= 1) {
                    container.scrollTop = prejumpTop;
                }
            }
            container.scrollTo({
                top: targetTop,
                behavior: 'smooth',
            });
        };
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
                let nextTop;
                if (current === container) {
                    const maxScrollTop = Math.max(0, container.scrollHeight - container.clientHeight);
                    nextTop = Math.min(offset, maxScrollTop);
                } else {
                    const containerRect = container.getBoundingClientRect();
                    const fallbackOffset = nodeRect.top - containerRect.top;
                    const maxScrollTop = Math.max(0, container.scrollHeight - container.clientHeight);
                    nextTop = Math.min(container.scrollTop + fallbackOffset, maxScrollTop);
                }
                animateScrollTo(nextTop);
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
            if (selectedNode?.path?.length) {
                ensurePathExpanded(selectedNode.path);
                setPendingScrollId(selectedNode.uid || '');
            } else {
                expandPathToItem(selectedId);
                const selectedUid = findNodeUidById(tree, selectedId);
                setPendingScrollId(selectedUid || '');
            }
            return;
        }
        if (clearSearchRequestedRef.current) {
            clearSearchRequestedRef.current = false;
        }
    }, [ensurePathExpanded, expandPathToItem, isSearchActive, searchTokens.length, selectedId, selectedNode, tree]);

    useEffect(() => {
        if (!pendingScrollId || searchTokens.length > 0) {
            return;
        }
        scrollToNodeId(pendingScrollId);
    }, [pendingScrollId, scrollToNodeId, searchTokens.length]);

    useEffect(() => {
        if (!selectedItem) {
            return;
        }
        const dashboardUrl = buildDashboardUrl(
            grafanaBaseUrl,
            DASHBOARDS.timeline.uid,
            DASHBOARDS.timeline.slug,
            selectedItem.id,
            theme,
            DASHBOARDS.timeline.panelId,
            appBaseUrl,
        );
        pendingGrafanaSrcRef.current = dashboardUrl;
        const iframe = grafanaIframeRef.current;
        if (iframe?.contentWindow && grafanaFrameReadyRef.current) {
            iframe.contentWindow.postMessage(
                {type: 'set-grafana-src', src: dashboardUrl},
                window.location.origin,
            );
        }
    }, [appBaseUrl, grafanaBaseUrl, selectedItem, theme]);

    return (
        <div
            className={`app ${isMobileLayout ? 'is-mobile' : 'is-desktop'} ${
                isSidebarOpen ? 'sidebar-open' : 'sidebar-collapsed'
            }`}
        >
            <SidebarPanel
                isSidebarOpen={isSidebarOpen}
                homeHref={homeHref}
                homeIconSrc={homeIconSrc}
                iconSpriteHref={iconSpriteHref}
                onToggleSidebar={handleToggleSidebar}
                sidebarTitle={sidebarTitle}
                error={error}
                tree={tree}
                searchQuery={searchQuery}
                searchSuggestionsListId={searchSuggestionsListId}
                searchAutocompleteOptions={searchAutocompleteOptions}
                setSearchQuery={setSearchQuery}
                isSearchActive={isSearchActive}
                setIsSearchActive={setIsSearchActive}
                onClearSearch={handleClearSearch}
                onCollapseAll={handleCollapseAll}
                onExpandAll={handleExpandAll}
                searchResults={searchResults}
                selectedId={selectedId}
                selectedNodeUid={selectedNode?.uid || ''}
                basePath={basePath}
                onSelectItemById={handleSelectItemById}
                onExpandPathToItem={expandPathToItem}
                itemStatuses={itemStatuses}
                lastUpdated={lastUpdated}
                catalogTreeRef={catalogTreeRef}
                filteredTree={filteredTree}
                expandedIds={expandedIds}
                onToggleNode={handleToggleNode}
                onSelectNode={handleSelectItem}
            />
            {isMobileLayout && isSidebarOpen && (
                <button
                    type="button"
                    className="sidebar-backdrop"
                    onClick={() => setIsMobileSidebarOpen(false)}
                    aria-label="Close catalog panel"
                />
            )}
            <DetailsPanel
                contentRef={contentRef}
                isSidebarOpen={isSidebarOpen}
                iconSpriteHref={iconSpriteHref}
                onToggleSidebar={handleToggleSidebar}
                shouldOffsetContentHeader={shouldOffsetContentHeader}
                isTitlePrimaryBelowControls={isTitlePrimaryBelowControls}
                headerRef={headerRef}
                headerActionsRef={headerActionsRef}
                theme={theme}
                onToggleTheme={() => setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'))}
                onOpenAbout={() => setIsAboutOpen(true)}
                selectedItem={selectedItem}
                selectedStatus={selectedStatus}
                lastUpdated={lastUpdated}
                selectedTitleFirstWord={selectedTitleFirstWord}
                selectedTitleRest={selectedTitleRest}
                contentTitlePrimaryRef={contentTitlePrimaryRef}
                failingSignalsCount={failingSignalsCount}
                selectedFailingSignals={selectedFailingSignals}
                failingDependencies={failingDependencies}
                hasFailingSignals={hasFailingSignals}
                isFailingSignalsOpen={isFailingSignalsOpen}
                onToggleFailingSignals={() => setIsFailingSignalsOpen((prev) => !prev)}
                buildItemLink={buildItemLink}
                onSelectItemByPath={handleSelectItemByPath}
                passingSignalsCount={passingSignalsCount}
                selectedPassingSignals={selectedPassingSignals}
                hasOwnHealthSignals={hasOwnHealthSignals}
                isPassingSignalsOpen={isPassingSignalsOpen}
                onTogglePassingSignals={() => setIsPassingSignalsOpen((prev) => !prev)}
                isGrafanaOpen={isGrafanaOpen}
                onToggleGrafana={() => setIsGrafanaOpen((prev) => !prev)}
                grafanaHeight={grafanaHeight}
                grafanaIframeRef={grafanaIframeRef}
                onGrafanaLoad={handleGrafanaLoad}
                grafanaFrameUrl={grafanaFrameUrl}
            />
            <AboutModal
                isOpen={isAboutOpen}
                onClose={() => setIsAboutOpen(false)}
            />
        </div>
    );
}
