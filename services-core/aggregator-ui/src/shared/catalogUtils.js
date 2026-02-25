/**
 * @file Catalog/tree/search/routing helpers used by App and SidebarPanel.
 * These functions are intentionally pure (or close to pure) and UI-agnostic.
 */
const sortItemsByName = (items) =>
    [...items].sort((a, b) => (a.name || a.id).localeCompare(b.name || b.id));

const sortNodesByName = (nodes) =>
    [...nodes].sort((a, b) =>
        (a.item.name || a.item.id).localeCompare(b.item.name || b.item.id),
    );

/**
 * Collects item ids from all nodes in traversal order.
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
 */
export const collectExpandableIds = (nodes) =>
    collectNodeIds(nodes).filter((id, index, arr) => arr.indexOf(id) === index);

/**
 * Builds a dependency tree from flat catalog items + dependency edges.
 * Each node includes:
 * - `uid`: stable UI key/path for scrolling
 * - `path`: logical item path for URL sync
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

/**
 * Filters the tree while preserving ancestors of matching descendants.
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
 * Ranks flat search results by field match quality (name > id > type).
 */
export const rankSearchResults = (items, queryTokens) => {
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
    return results.sort(
        (a, b) =>
            b.score - a.score ||
            (a.item.name || a.item.id).localeCompare(b.item.name || b.item.id),
    );
};

/**
 * Builds a unique sorted vocabulary from item names for search autocomplete.
 */
export const buildNameWordVocabulary = (items) => {
    const seen = new Set();
    const words = [];
    items.forEach((item) => {
        normalizeSearchText(item.name || '')
            .split(' ')
            .filter(Boolean)
            .forEach((word) => {
                if (seen.has(word)) {
                    return;
                }
                seen.add(word);
                words.push(word);
            });
    });
    return words.sort((a, b) => a.localeCompare(b));
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
 */
export const buildSearchAutocompleteOptions = (query, vocabulary, limit = 12) => {
    const {baseTokens, currentToken} = parseSearchAutocompleteQuery(query);
    if (!currentToken) {
        return [];
    }

    const options = [];
    for (const word of vocabulary) {
        if (!word.startsWith(currentToken) || word === currentToken) {
            continue;
        }
        const fullQuery = [...baseTokens, word].join(' ');
        options.push({word, fullQuery});
        if (options.length >= limit) {
            break;
        }
    }
    return options;
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
