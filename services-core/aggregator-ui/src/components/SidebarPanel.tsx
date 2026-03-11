/**
 * @file Sidebar UI for catalog navigation and search.
 */

import {buildItemRouteHref, isPlainLeftClick} from '../shared/catalogUtils';
import {buildStatusText} from '../shared/statusText';
import type {
    CatalogTreeNode,
    HealthStatus,
    SearchAutocompleteOption,
    SearchResult,
} from '../shared/types';
import type {MutableRefObject} from 'react';

type CatalogNodeProps = {
    node: CatalogTreeNode;
    selectedNodeUid: string;
    onSelect: (node: CatalogTreeNode) => void;
    basePath: string;
    expandedIds: Set<string>;
    onToggleNode: (node: CatalogTreeNode) => void;
    status: HealthStatus;
    statuses: Record<string, HealthStatus>;
    lastUpdated: string;
};

type SidebarPanelProps = {
    isSidebarOpen: boolean;
    homeHref: string;
    homeIconSrc: string;
    iconSpriteHref: string;
    onToggleSidebar: () => void;
    sidebarTitle: string;
    error: string;
    tree: CatalogTreeNode[];
    searchQuery: string;
    searchSuggestionsListId: string;
    isSearchAutocompleteReady: boolean;
    searchAutocompleteOptions: SearchAutocompleteOption[];
    setSearchQuery: (value: string) => void;
    isSearchActive: boolean;
    setIsSearchActive: (value: boolean) => void;
    onClearSearch: () => void;
    onCollapseAll: () => void;
    onExpandAll: () => void;
    searchResults: SearchResult[];
    selectedId: string;
    selectedNodeUid: string;
    basePath: string;
    onSelectItemById: (itemId: string) => void;
    onExpandPathToItem: (itemId: string) => void;
    itemStatuses: Record<string, HealthStatus>;
    lastUpdated: string;
    catalogTreeRef: MutableRefObject<HTMLDivElement | null>;
    filteredTree: CatalogTreeNode[];
    expandedIds: Set<string>;
    onToggleNode: (node: CatalogTreeNode) => void;
    onSelectNode: (node: CatalogTreeNode) => void;
};

/**
 * Recursive tree node renderer used only by SidebarPanel.
 * Kept local to preserve the coarse-grained component split.
 *
 */
const CatalogNode = ({
    node,
    selectedNodeUid,
    onSelect,
    basePath,
    expandedIds,
    onToggleNode,
    status,
    statuses,
    lastUpdated,
}: CatalogNodeProps) => {
    const hasChildren = node.children.length > 0;
    const isExpanded = expandedIds.has(node.item.id);
    const statusLabel = buildStatusText(status, {lastUpdated});
    const itemHref = buildItemRouteHref(basePath, node.item.id, node.path);

    const row = (
        <div
            className={`node-row ${selectedNodeUid === node.uid ? 'is-selected' : ''}`}
            data-node-id={node.uid}
        >
            {hasChildren ? (
                <button
                    className={`node-toggle-column ${isExpanded ? 'is-expanded' : ''}`}
                    type="button"
                    aria-label={isExpanded ? 'Collapse children' : 'Expand children'}
                    title={isExpanded ? 'Collapse children' : 'Expand children'}
                    onClick={(event) => {
                        event.stopPropagation();
                        onToggleNode(node);
                    }}
                >
                    <span
                        className={`expand-chevron ${isExpanded ? 'is-open' : ''}`}
                        aria-hidden="true"
                    >
                        ›
                    </span>
                </button>
            ) : (
                <span className="node-toggle-column node-toggle-spacer" aria-hidden="true"/>
            )}
            <a
                className="node-content"
                href={itemHref}
                onClick={(event) => {
                    if (!isPlainLeftClick(event)) {
                        return;
                    }
                    event.preventDefault();
                    onSelect(node);
                }}
            >
                <div className="node-main">
                    <div className="node-label">
                        <span className="node-heading">
                            <span
                                className={`status-indicator status-${status}`}
                                aria-label={statusLabel}
                                title={statusLabel}
                            />
                            {node.item.title && <span className="node-name">{node.item.title}</span>}
                        </span>
                    </div>
                </div>
            </a>
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
                            selectedNodeUid={selectedNodeUid}
                            onSelect={onSelect}
                            basePath={basePath}
                            expandedIds={expandedIds}
                            onToggleNode={onToggleNode}
                            status={statuses[child.item.id] || 'unknown'}
                            statuses={statuses}
                            lastUpdated={lastUpdated}
                        />
                    ))}
            </div>
        </div>
    );
};

/**
 * Renders the left-side navigation area:
 * - catalog tree
 * - search input + autocomplete
 * - search results mode
 *
 * App owns orchestration state and passes callbacks / derived data.
 *
 */
export default function SidebarPanel({
    isSidebarOpen,
    homeHref,
    homeIconSrc,
    iconSpriteHref,
    onToggleSidebar,
    sidebarTitle,
    error,
    tree,
    searchQuery,
    searchSuggestionsListId,
    isSearchAutocompleteReady,
    searchAutocompleteOptions,
    setSearchQuery,
    isSearchActive,
    setIsSearchActive,
    onClearSearch,
    onCollapseAll,
    onExpandAll,
    searchResults,
    selectedId,
    selectedNodeUid,
    basePath,
    onSelectItemById,
    onExpandPathToItem,
    itemStatuses,
    lastUpdated,
    catalogTreeRef,
    filteredTree,
    expandedIds,
    onToggleNode,
    onSelectNode,
}: SidebarPanelProps) {
    return (
        <aside className="sidebar">
            {isSidebarOpen && (
                <>
                    <a
                        className="home-link sidebar-toggle top-control top-control-button top-control-icon"
                        href={homeHref}
                        aria-label="Go to home page"
                    >
                        <img src={homeIconSrc} alt="" aria-hidden="true"/>
                    </a>
                    <button
                        type="button"
                        aria-label="Close catalog panel"
                        title="Close sidebar"
                        className="sidebar-close sidebar-close-in top-control top-control-button top-control-icon"
                        onClick={onToggleSidebar}
                    >
                        <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
                            <use href={`${iconSpriteHref}#icon-panel-close`}/>
                        </svg>
                    </button>
                </>
            )}
            <div className="sidebar-header">
                <span className="sidebar-header-title" title={sidebarTitle}>{sidebarTitle}</span>
            </div>
            {error && <div className="error">{error}</div>}
            {!error && tree.length > 0 && (
                <div className="tree-search">
                    <span className="search-icon" aria-hidden="true">
                        <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
                            <use href={`${iconSpriteHref}#icon-search`}/>
                        </svg>
                    </span>
                    <input
                        id="item-search-input"
                        name="item-search"
                        type="text"
                        placeholder="Search item..."
                        value={searchQuery}
                        list={searchSuggestionsListId}
                        onKeyDown={(event) => {
                            if (
                                event.key !== 'Tab' ||
                                event.shiftKey ||
                                event.ctrlKey ||
                                event.metaKey ||
                                event.altKey
                            ) {
                                return;
                            }
                            if (!isSearchAutocompleteReady) {
                                return;
                            }
                            const firstSuggestion = searchAutocompleteOptions[0];
                            if (!firstSuggestion) {
                                return;
                            }
                            event.preventDefault();
                            setSearchQuery(`${firstSuggestion.fullQuery} `);
                            if (!isSearchActive) {
                                setIsSearchActive(true);
                            }
                        }}
                        onChange={(event) => {
                            const nextValue = event.target.value;
                            setSearchQuery(nextValue);
                            if (!isSearchActive && nextValue.trim()) {
                                setIsSearchActive(true);
                            }
                        }}
                        aria-label="Search items by title"
                        aria-busy={!isSearchAutocompleteReady}
                    />
                    <datalist id={searchSuggestionsListId}>
                        {searchAutocompleteOptions.map((option) => (
                            <option key={option.fullQuery} value={option.fullQuery} label={option.word}/>
                        ))}
                    </datalist>
                    {(searchQuery || isSearchActive) && (
                        <button
                            type="button"
                            className="search-clear"
                            aria-label="Clear search"
                            onClick={onClearSearch}
                        >
                            ✕
                        </button>
                    )}
                </div>
            )}
            {!error && tree.length > 0 && (
                <div className="tree-controls">
                    <button
                        type="button"
                        title="Collapse all dependencies"
                        className="tree-control-button"
                        onClick={onCollapseAll}
                        disabled={isSearchActive}
                    >
                        <span className="tree-control-icon" aria-hidden="true">⇧</span>
                        <span className="tree-control-text">Collapse all</span>
                    </button>
                    <button
                        type="button"
                        title="Expand to all dependencies"
                        className="tree-control-button"
                        onClick={onExpandAll}
                        disabled={isSearchActive}
                    >
                        <span className="tree-control-icon" aria-hidden="true">⇩</span>
                        <span className="tree-control-text">Expand all</span>
                    </button>
                </div>
            )}
            {!error && tree.length === 0 && (
                            <div className="empty">Catalog is empty. Add items to catalog-items.yaml.</div>
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
                            {searchResults.map(({item}) => {
                                const searchItemStatus = itemStatuses[item.id] || 'unknown';
                                const searchItemStatusText = buildStatusText(searchItemStatus, {
                                    lastUpdated,
                                });
                                return (
                                    <div key={item.id} className="catalog-item node-leaf">
                                        <div
                                            className={`node-row ${selectedId === item.id ? 'is-selected' : ''}`}
                                            data-node-id={item.id}
                                        >
                                            <span className="node-toggle-column node-toggle-spacer" aria-hidden="true"/>
                                            <a
                                                className="node-content"
                                                href={buildItemRouteHref(basePath, item.id, [item.id])}
                                                onClick={(event) => {
                                                    if (!isPlainLeftClick(event)) {
                                                        return;
                                                    }
                                                    event.preventDefault();
                                                    event.stopPropagation();
                                                    onSelectItemById(item.id);
                                                    onExpandPathToItem(item.id);
                                                }}
                                            >
                                                <div className="node-main">
                                                    <div className="node-label">
                                                        <span className="node-heading">
                                                            <span
                                                                className={`status-indicator status-${searchItemStatus}`}
                                                                aria-label={searchItemStatusText}
                                                                title={searchItemStatusText}
                                                            />
                                                {item.title &&
                                                    <span className="node-name">{item.title}</span>}
                                                        </span>
                                                    </div>
                                                </div>
                                            </a>
                                        </div>
                                    </div>
                                );
                            })}
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
                                selectedNodeUid={selectedNodeUid}
                                onSelect={onSelectNode}
                                basePath={basePath}
                                expandedIds={expandedIds}
                                onToggleNode={onToggleNode}
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
    );
}
