import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import yaml from 'js-yaml';

const DASHBOARDS = {
  timeline: 'catalog-item-state-timeline',
};

const DASHBOARD_SLUGS = {
  timeline: 'catalog-item-state-timeline',
};

const DASHBOARD_PANELS = {
  timeline: 2001,
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
    return { item, children };
  };

  return rootItems.map((item) => toNode(item.id)).filter(Boolean);
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
  isSolo = false,
) => {
  const url = new URL(baseUrl, window.location.origin);
  const segments = url.pathname.split('/').filter(Boolean);
  const dashboardSegment = isSolo ? 'd-solo' : 'd';
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
  isSolo = false,
) => {
  const params = new URLSearchParams({
    orgId: '1',
    'var-item_id': itemId,
    theme,
  });
  if (panelId) {
    params.set('viewPanel', panelId);
  }
  const normalizedBaseUrl = normalizeDashboardBaseUrl(
    baseUrl,
    dashboardUid,
    dashboardSlug,
    isSolo,
  );
  return `${normalizedBaseUrl}?${params.toString()}&kiosk`;
};

const CatalogNode = ({
  node,
  selectedId,
  onSelect,
  expandedIds,
  onToggleDirectChildren,
  onToggleAllChildren,
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
  const descendantIds = collectDescendantIds(node);
  const isFullyExpanded = hasChildren && descendantIds.every((id) => expandedIds.has(id));
  const timelineUrl = buildDashboardUrl(
    grafanaBaseUrl,
    DASHBOARDS.timeline,
    DASHBOARD_SLUGS.timeline,
    node.item.id,
    theme,
    DASHBOARD_PANELS.timeline,
  );
  const statusLabel = `Status: ${status.toUpperCase()}${
    lastUpdated ? ` (at ${lastUpdated})` : ''
  }`;

  useEffect(() => {
    let animationFrameId;
    let nestedAnimationFrameId;

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
  }, [isExpanded]);

  const row = (
    <div className={`node-row ${selectedId === node.item.id ? 'is-selected' : ''}`}>
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
      <div className="node-links" onClick={(event) => event.stopPropagation()}>
        <a href={timelineUrl} target="_blank" rel="noreferrer">
          State Timeline
        </a>
      </div>
      {hasChildren && (
        <div className="node-controls" onClick={(event) => event.stopPropagation()}>
          <button type="button" onClick={() => onToggleDirectChildren(node)}>
            {isExpanded ? 'Collapse direct children' : 'Show direct children'}
          </button>
          <button type="button" onClick={() => onToggleAllChildren(node)}>
            {isFullyExpanded ? 'Collapse all children' : 'Show all children'}
          </button>
        </div>
      )}
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
              onToggleDirectChildren={onToggleDirectChildren}
              onToggleAllChildren={onToggleAllChildren}
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
  const [catalog, setCatalog] = useState({ items: [], dependencies: [] });
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
        setCatalog({ items, dependencies });
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

  const handleToggleDirectChildren = useCallback((node) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      const descendants = collectDescendantIds(node);
      if (next.has(node.item.id)) {
        next.delete(node.item.id);
        descendants.forEach((id) => next.delete(id));
        return next;
      }

      next.add(node.item.id);
      descendants.forEach((id) => next.delete(id));
      return next;
    });
  }, []);

  const handleToggleAllChildren = useCallback((node) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      const descendants = collectDescendantIds(node);
      const allExpanded = next.has(node.item.id)
        && descendants.every((id) => next.has(id));

      if (allExpanded) {
        next.delete(node.item.id);
        descendants.forEach((id) => next.delete(id));
        return next;
      }

      next.add(node.item.id);
      descendants.forEach((id) => next.add(id));
      return next;
    });
  }, []);

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
            <button type="button" onClick={handleCollapseAll}>Collapse all</button>
            <button type="button" onClick={handleExpandAll}>Expand all</button>
          </div>
        )}
        {!error && tree.length === 0 && (
          <div className="empty">Catalog is empty. Add items to catalog.yaml.</div>
        )}
        <ul className="catalog-tree">
          {tree.map((node) => (
            <CatalogNode
              key={node.item.id}
              node={node}
              selectedId={selectedId}
              onSelect={handleSelectItem}
              expandedIds={expandedIds}
              onToggleDirectChildren={handleToggleDirectChildren}
              onToggleAllChildren={handleToggleAllChildren}
              grafanaBaseUrl={grafanaBaseUrl}
              theme={theme}
              status={itemStatuses[node.item.id] || 'unknown'}
              statuses={itemStatuses}
              lastUpdated={lastUpdated}
            />
          ))}
        </ul>
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
            {theme === 'dark' ? 'Light Theme' : 'Dark Theme'}
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
                  DASHBOARDS.timeline,
                  DASHBOARD_SLUGS.timeline,
                  selectedItem.id,
                  theme,
                  DASHBOARD_PANELS.timeline,
                )}
              />
            </section>
          </div>
        )}
      </main>
    </div>
  );
}
