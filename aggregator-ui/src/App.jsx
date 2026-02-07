import { useEffect, useMemo, useState } from 'react';
import yaml from 'js-yaml';

const DASHBOARDS = {
  timeline: 'catalog-item-state-timeline',
};

const sortItemsByName = (items) =>
  [...items].sort((a, b) => (a.name || a.id).localeCompare(b.name || b.id));

const sortNodesByName = (nodes) =>
  [...nodes].sort((a, b) =>
    (a.item.name || a.item.id).localeCompare(b.item.name || b.item.id),
  );

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

const resolveGrafanaBaseUrl = () => {
  const configured = window.__AGGREGATOR_UI__?.grafanaUrl;
  if (configured) {
    return configured;
  }
  if (import.meta.env.VITE_GRAFANA_URL) {
    return import.meta.env.VITE_GRAFANA_URL;
  }
  return `${window.location.origin}/grafana`;
};

const buildDashboardUrl = (baseUrl, dashboardUid, itemId, theme) => {
  const params = new URLSearchParams({
    orgId: '1',
    'var-item_id': itemId,
    theme,
  });
  return `${baseUrl}/d/${dashboardUid}?${params.toString()}&kiosk`;
};

const CatalogNode = ({ node, selectedId, onSelect, grafanaBaseUrl, theme }) => {
  const hasChildren = node.children.length > 0;
  const timelineUrl = buildDashboardUrl(grafanaBaseUrl, DASHBOARDS.timeline, node.item.id, theme);

  const row = (
    <div className={`node-row ${selectedId === node.item.id ? 'is-selected' : ''}`}>
      <button
        type="button"
        className="node-label"
        onClick={(event) => {
          event.stopPropagation();
          onSelect(node.item.id);
        }}
      >
        <span className="node-key">{node.item.id}</span>
        {node.item.name && <span className="node-name">{node.item.name}</span>}
      </button>
      <div className="node-links" onClick={(event) => event.stopPropagation()}>
        <a href={timelineUrl} target="_blank" rel="noreferrer">
          State Timeline
        </a>
      </div>
    </div>
  );

  if (!hasChildren) {
    return <li className="node-leaf">{row}</li>;
  }

  return (
    <li>
      <details open>
        <summary>{row}</summary>
        <ul>{node.children.map((child) => <CatalogNode key={child.item.id} node={child} selectedId={selectedId} onSelect={onSelect} grafanaBaseUrl={grafanaBaseUrl} theme={theme} />)}</ul>
      </details>
    </li>
  );
};

export default function App() {
  const [catalog, setCatalog] = useState({ items: [], dependencies: [] });
  const [selectedId, setSelectedId] = useState('');
  const [error, setError] = useState('');
  const [theme, setTheme] = useState(getInitialTheme);

  const grafanaBaseUrl = useMemo(resolveGrafanaBaseUrl, []);

  useEffect(() => {
    document.body.dataset.theme = theme;
    localStorage.setItem('aggregator-ui-theme', theme);
  }, [theme]);

  useEffect(() => {
    const loadCatalog = async () => {
      try {
        const response = await fetch('/catalog.yaml');
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

  const tree = useMemo(
    () => buildCatalogTree(catalog.items, catalog.dependencies),
    [catalog.items, catalog.dependencies],
  );

  const selectedItem = catalog.items.find((item) => item.id === selectedId);

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="sidebar-header">
          <div>
            <div className="app-title">Aggregator UI</div>
            <div className="app-subtitle">Catalog Explorer</div>
          </div>
          <button
            type="button"
            className="theme-toggle"
            onClick={() => setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'))}
          >
            {theme === 'dark' ? 'Light Theme' : 'Dark Theme'}
          </button>
        </div>
        {error && <div className="error">{error}</div>}
        {!error && tree.length === 0 && (
          <div className="empty">Catalog is empty. Add items to catalog.yaml.</div>
        )}
        <ul className="catalog-tree">
          {tree.map((node) => (
            <CatalogNode
              key={node.item.id}
              node={node}
              selectedId={selectedId}
              onSelect={setSelectedId}
              grafanaBaseUrl={grafanaBaseUrl}
              theme={theme}
            />
          ))}
        </ul>
      </aside>
      <main className="content">
        <header className="content-header">
          <div>
            <div className="content-title">Grafana Dashboards</div>
            <div className="content-subtitle">
              {selectedItem ? selectedItem.name || selectedItem.id : 'Select an item'}
            </div>
          </div>
          <div className="grafana-meta">Theme: {theme}</div>
        </header>
        {!selectedItem ? (
          <div className="empty">Select a catalog item to view dashboards.</div>
        ) : (
          <div className="grafana-grid">
            <section className="grafana-panel">
              <div className="panel-header">State Timeline</div>
              <iframe
                title="State Timeline"
                src={buildDashboardUrl(
                  grafanaBaseUrl,
                  DASHBOARDS.timeline,
                  selectedItem.id,
                  theme,
                )}
              />
            </section>
          </div>
        )}
      </main>
    </div>
  );
}
