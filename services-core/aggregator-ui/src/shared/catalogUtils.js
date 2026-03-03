/**
 * @file Catalog/tree/search/routing helpers used by App and SidebarPanel.
 * These functions are intentionally pure (or close to pure) and UI-agnostic.
 */
/** @typedef {import('./types').CatalogItem} CatalogItem */
/** @typedef {import('./types').CatalogDependency} CatalogDependency */
/** @typedef {import('./types').CatalogTreeNode} CatalogTreeNode */
/** @typedef {import('./types').SearchResult} SearchResult */
/** @typedef {import('./types').SearchAutocompleteOption} SearchAutocompleteOption */
/** @typedef {import('./types').SearchAutocompleteIndex} SearchAutocompleteIndex */
/**
 * Returns items sorted by display name falling back to id.
 *
 * @param {CatalogItem[]} items
 * @returns {CatalogItem[]}
 */
const sortItemsByName = (items) =>
    [...items].sort((a, b) => (a.name || a.id).localeCompare(b.name || b.id));

/**
 * Returns tree nodes sorted by display name falling back to id.
 *
 * @param {CatalogTreeNode[]} nodes
 * @returns {CatalogTreeNode[]}
 */
const sortNodesByName = (nodes) =>
    [...nodes].sort((a, b) =>
        (a.item.name || a.item.id).localeCompare(b.item.name || b.item.id),
    );

/**
 * Collects item ids from all nodes in traversal order.
 *
 * @param {CatalogTreeNode[]} nodes
 * @returns {string[]}
 */
export const collectNodeIds = (nodes) => {
    const ids = [];
    const visit = (node) => {
        ids.push(node.item.id);
        node.children.forEach(visit);
    };
    nodes.forEach(visit);
    return ids;
};

/**
 * Collects ids of all descendants for a single node.
 *
 * @param {CatalogTreeNode} node
 * @returns {string[]}
 */
export const collectDescendantIds = (node) => {
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

/**
 * Returns unique ids for all nodes that can participate in expand/collapse actions.
 *
 * @param {CatalogTreeNode[]} nodes
 * @returns {string[]}
 */
export const collectExpandableIds = (nodes) =>
    collectNodeIds(nodes).filter((id, index, arr) => arr.indexOf(id) === index);

/**
 * Builds a dependency tree from flat catalog items + dependency edges.
 * Each node includes:
 * - `uid`: stable UI key/path for scrolling
 * - `path`: logical item path for URL sync
 *
 * @param {CatalogItem[]} items
 * @param {CatalogDependency[]} dependencies
 * @returns {CatalogTreeNode[]}
 */
export const buildCatalogTree = (items, dependencies) => {
    const itemMap = new Map(items.map((item) => [item.id, item]));
    const childrenMap = new Map();
    const childIds = new Set();

    dependencies.forEach((dep) => {
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

/**
 * Normalizes text for case-insensitive token-based search.
 */
export const normalizeSearchText = (value) =>
    value.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

/**
 * Checks whether an item matches all normalized search tokens.
 */
const matchSearch = (item, queryTokens) => {
    if (!queryTokens.length) {
        return true;
    }
    const name = normalizeSearchText(item.name || '');
    return queryTokens.every((token) => name.includes(token));
};

/**
 * Filters the tree while preserving ancestors of matching descendants.
 *
 * @param {CatalogTreeNode[]} nodes
 * @param {string[]} queryTokens
 * @returns {CatalogTreeNode[]}
 */
export const filterCatalogTree = (nodes, queryTokens) => {
    if (!queryTokens.length) {
        return nodes;
    }
    const visit = (node) => {
        const filteredChildren = node.children.map(visit).filter(Boolean);
        if (matchSearch(node.item, queryTokens) || filteredChildren.length > 0) {
            return {...node, children: filteredChildren};
        }
        return null;
    };
    return nodes.map(visit).filter(Boolean);
};

/**
 * Finds a tree path (item id chain) to the target item.
 *
 * @param {CatalogTreeNode[]} nodes
 * @param {string} targetId
 * @returns {string[] | null}
 */
export const findNodePath = (nodes, targetId) => {
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

/**
 * Finds the first node with the given item id.
 *
 * @param {CatalogTreeNode[]} nodes
 * @param {string} targetId
 * @returns {CatalogTreeNode | null}
 */
export const findNodeById = (nodes, targetId) => {
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

/**
 * Resolves a node by exact path of item ids.
 *
 * @param {CatalogTreeNode[]} nodes
 * @param {string[]} pathIds
 * @returns {CatalogTreeNode | null}
 */
export const findNodeByPath = (nodes, pathIds) => {
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

/**
 * Returns UI uid for the first node matching the item id.
 *
 * @param {CatalogTreeNode[]} nodes
 * @param {string} targetId
 * @returns {string | null}
 */
export const findNodeUidById = (nodes, targetId) => {
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

/**
 * Ranks flat search results by title match quality.
 *
 * @param {CatalogItem[]} items
 * @param {string[]} queryTokens
 * @returns {SearchResult[]}
 */
export const rankSearchResults = (items, queryTokens) => {
    if (!queryTokens.length) {
        return [];
    }
    const results = [];
    items.forEach((item) => {
        const name = normalizeSearchText(item.name || '');
        if (!queryTokens.every((token) => name.includes(token))) {
            return;
        }
        let score = 0;
        queryTokens.forEach((token) => {
            if (name.includes(token)) {
                score += 3;
            }
        });
        results.push({item, score});
    });
    return results.sort(
        (a, b) =>
            b.score - a.score ||
            (a.item.name || a.item.id).localeCompare(b.item.name || b.item.id),
    );
};

/**
 * Builds an autocomplete index from item titles.
 *
 * `tokenToItemIds` maps a token to numeric item indexes containing it.
 * `itemIdToTokens` stores unique normalized title tokens for each item index.
 *
 * @param {CatalogItem[]} items
 * @returns {SearchAutocompleteIndex}
 */
export const buildSearchAutocompleteIndex = (items) => {
    const tokenToItemIds = new Map();
    const itemIdToTokens = [];

    items.forEach((item, index) => {
        const tokens = [...new Set(normalizeSearchText(item.name || '').split(' ').filter(Boolean))];
        itemIdToTokens[index] = tokens;
        tokens.forEach((token) => {
            const itemIds = tokenToItemIds.get(token);
            if (itemIds) {
                itemIds.add(index);
                return;
            }
            tokenToItemIds.set(token, new Set([index]));
        });
    });

    return {tokenToItemIds, itemIdToTokens};
};

/**
 * Splits a free-form query into completed tokens and current partial token.
 */
const parseSearchAutocompleteQuery = (query) => {
    const rawQuery = query || '';
    const endsWithSpace = /\s$/.test(rawQuery);
    const normalizedQuery = normalizeSearchText(rawQuery);
    const tokens = normalizedQuery ? normalizedQuery.split(' ').filter(Boolean) : [];
    const baseTokens = endsWithSpace ? tokens : tokens.slice(0, -1);
    const currentToken = endsWithSpace ? '' : (tokens[tokens.length - 1] || '');
    return {baseTokens, currentToken};
};

/**
 * Builds autocomplete suggestions for the current partial search token.
 *
 * @param {string} query
 * @param {SearchAutocompleteIndex | null} searchIndex
 * @param {number} [limit=12]
 * @returns {SearchAutocompleteOption[]}
 */
export const buildSearchAutocompleteOptions = (query, searchIndex, limit = 12) => {
    const {baseTokens, currentToken} = parseSearchAutocompleteQuery(query);
    if (!currentToken || !searchIndex) {
        return [];
    }

    const baseTokenSet = new Set(baseTokens);
    const uniqueBaseTokens = [...baseTokenSet];
    const candidateWords = new Set();
    const baseItemSets = uniqueBaseTokens.map((token) => searchIndex.tokenToItemIds.get(token));

    if (baseItemSets.some((itemSet) => !itemSet)) {
        return [];
    }

    const matchingItemIds = [];
    if (!baseItemSets.length) {
        for (let index = 0; index < searchIndex.itemIdToTokens.length; index += 1) {
            matchingItemIds.push(index);
        }
    } else {
        const [smallestSet, ...otherSets] = [...baseItemSets].sort((a, b) => a.size - b.size);
        for (const itemId of smallestSet) {
            if (otherSets.every((itemSet) => itemSet.has(itemId))) {
                matchingItemIds.push(itemId);
            }
        }
    }

    const options = [];
    for (const itemId of matchingItemIds) {
        const titleTokens = searchIndex.itemIdToTokens[itemId] || [];
        for (const word of titleTokens) {
            if (
                !word.startsWith(currentToken) ||
                word === currentToken ||
                baseTokenSet.has(word) ||
                candidateWords.has(word)
            ) {
                continue;
            }
            candidateWords.add(word);
            const fullQuery = [...baseTokens, word].join(' ');
            options.push({word, fullQuery});
            if (options.length >= limit) {
                return options.sort((a, b) => a.word.localeCompare(b.word));
            }
        }
    }
    return options.sort((a, b) => a.word.localeCompare(b.word));
};

/**
 * Removes app base path prefix from a browser pathname.
 */
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

/**
 * Parses encoded `path` query parameter into item id segments.
 */
export const parseServicePath = (value) => {
    if (!value) {
        return [];
    }
    return value
        .split('/')
        .map((segment) => decodeURIComponent(segment))
        .filter(Boolean);
};

/**
 * Encodes a path of item ids for use in the `path` query parameter.
 */
export const buildServicePath = (pathIds) =>
    pathIds.map((segment) => encodeURIComponent(segment)).join('/');

/**
 * Builds `/item/:id` pathname under the configured app base path.
 */
export const buildItemPathname = (basePath, itemId) => {
    const normalizedBase = basePath.endsWith('/') ? basePath.slice(0, -1) : basePath;
    const prefix = normalizedBase === '' ? '' : normalizedBase;
    return `${prefix}/item/${encodeURIComponent(itemId)}`;
};

/**
 * Builds a clickable item URL including optional resolved tree path.
 */
export const buildItemRouteHref = (basePath, itemId, pathIds = []) => {
    const pathname = buildItemPathname(basePath, itemId);
    if (!Array.isArray(pathIds) || pathIds.length === 0) {
        return pathname;
    }
    const params = new URLSearchParams();
    params.set('path', buildServicePath(pathIds));
    return `${pathname}?${params.toString()}`;
};

/**
 * Returns true only for unmodified primary-button clicks.
 */
export const isPlainLeftClick = (event) =>
    event.button === 0 &&
    !event.defaultPrevented &&
    !event.metaKey &&
    !event.ctrlKey &&
    !event.shiftKey &&
    !event.altKey;

/**
 * Resolves selected tree node from current browser location.
 * Supports both `/item/:id` and `?path=` route context.
 *
 * @param {CatalogTreeNode[]} nodes
 * @param {string} basePath
 * @returns {{node: CatalogTreeNode} | null}
 */
export const resolveNodeFromLocation = (nodes, basePath) => {
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

/**
 * Reads route context from browser location without requiring tree resolution.
 * Used by App for route normalization / popstate synchronization.
 */
export const readLocationRouteContext = (basePath) => {
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
