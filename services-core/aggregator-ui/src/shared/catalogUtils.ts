/**
 * @file Catalog/tree/search/routing helpers used by App and SidebarPanel.
 * These functions are intentionally pure (or close to pure) and UI-agnostic.
 */

import type {
    CatalogDependency,
    CatalogItem,
    CatalogTreeNode,
    SearchAutocompleteIndex,
    SearchAutocompleteOption,
    SearchResult,
} from './types';

const sortItemsByName = (items: CatalogItem[]): CatalogItem[] =>
    [...items].sort((a, b) => (a.name || a.id).localeCompare(b.name || b.id));

const sortNodesByName = (nodes: CatalogTreeNode[]): CatalogTreeNode[] =>
    [...nodes].sort((a, b) =>
        (a.item.name || a.item.id).localeCompare(b.item.name || b.item.id),
    );

export const collectNodeIds = (nodes: CatalogTreeNode[]): string[] => {
    const ids: string[] = [];
    const visit = (node: CatalogTreeNode) => {
        ids.push(node.item.id);
        node.children.forEach(visit);
    };
    nodes.forEach(visit);
    return ids;
};

export const collectDescendantIds = (node: CatalogTreeNode): string[] => {
    const descendants: string[] = [];
    const visit = (children: CatalogTreeNode[]) => {
        children.forEach((child) => {
            descendants.push(child.item.id);
            visit(child.children);
        });
    };
    visit(node.children);
    return descendants;
};

export const collectExpandableIds = (nodes: CatalogTreeNode[]): string[] =>
    collectNodeIds(nodes).filter((id, index, arr) => arr.indexOf(id) === index);

export const buildCatalogTree = (
    items: CatalogItem[],
    dependencies: CatalogDependency[],
): CatalogTreeNode[] => {
    const itemMap = new Map<string, CatalogItem>(items.map((item) => [item.id, item]));
    const childrenMap = new Map<string, string[]>();
    const childIds = new Set<string>();

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

    const toNode = (
        itemId: string,
        visited: Set<string> = new Set<string>(),
        pathSegments: string[] = [],
        pathIds: string[] = [],
    ): CatalogTreeNode | null => {
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
                        new Set<string>(visited),
                        [...pathSegments, `${index}:${childId}`],
                        path,
                    ),
                )
                .filter((node): node is CatalogTreeNode => Boolean(node)),
        );
        return {item, children, uid, path};
    };

    return rootItems
        .map((item, index) => toNode(item.id, new Set<string>(), [`${index}:${item.id}`], []))
        .filter((node): node is CatalogTreeNode => Boolean(node));
};

export const normalizeSearchText = (value: string): string =>
    value.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

const matchSearch = (item: CatalogItem, queryTokens: string[]): boolean => {
    if (!queryTokens.length) {
        return true;
    }
    const name = normalizeSearchText(item.name || '');
    return queryTokens.every((token) => name.includes(token));
};

export const filterCatalogTree = (
    nodes: CatalogTreeNode[],
    queryTokens: string[],
): CatalogTreeNode[] => {
    if (!queryTokens.length) {
        return nodes;
    }
    const visit = (node: CatalogTreeNode): CatalogTreeNode | null => {
        const filteredChildren = node.children
            .map(visit)
            .filter((child): child is CatalogTreeNode => Boolean(child));
        if (matchSearch(node.item, queryTokens) || filteredChildren.length > 0) {
            return {...node, children: filteredChildren};
        }
        return null;
    };
    return nodes
        .map(visit)
        .filter((node): node is CatalogTreeNode => Boolean(node));
};

export const findNodePath = (nodes: CatalogTreeNode[], targetId: string): string[] | null => {
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

export const findNodeById = (
    nodes: CatalogTreeNode[],
    targetId: string,
): CatalogTreeNode | null => {
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

export const findNodeByPath = (
    nodes: CatalogTreeNode[],
    pathIds: string[],
): CatalogTreeNode | null => {
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

export const findNodeUidById = (
    nodes: CatalogTreeNode[],
    targetId: string,
): string | null => {
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

export const rankSearchResults = (
    items: CatalogItem[],
    queryTokens: string[],
): SearchResult[] => {
    if (!queryTokens.length) {
        return [];
    }
    const results: SearchResult[] = [];
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

export const buildSearchAutocompleteIndex = (
    items: CatalogItem[],
): SearchAutocompleteIndex => {
    const tokenToItemIds = new Map<string, Set<number>>();
    const itemIdToTokens: string[][] = [];

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

const parseSearchAutocompleteQuery = (
    query: string,
): {baseTokens: string[]; currentToken: string} => {
    const rawQuery = query || '';
    const endsWithSpace = /\s$/.test(rawQuery);
    const normalizedQuery = normalizeSearchText(rawQuery);
    const tokens = normalizedQuery ? normalizedQuery.split(' ').filter(Boolean) : [];
    const baseTokens = endsWithSpace ? tokens : tokens.slice(0, -1);
    const currentToken = endsWithSpace ? '' : (tokens[tokens.length - 1] || '');
    return {baseTokens, currentToken};
};

export const buildSearchAutocompleteOptions = (
    query: string,
    searchIndex: SearchAutocompleteIndex | null,
    limit = 12,
): SearchAutocompleteOption[] => {
    const {baseTokens, currentToken} = parseSearchAutocompleteQuery(query);
    if (!currentToken || !searchIndex) {
        return [];
    }

    const baseTokenSet = new Set<string>(baseTokens);
    const uniqueBaseTokens = [...baseTokenSet];
    const candidateWords = new Set<string>();
    const baseItemSets = uniqueBaseTokens.map((token) => searchIndex.tokenToItemIds.get(token));

    if (baseItemSets.some((itemSet) => !itemSet)) {
        return [];
    }

    const matchingItemIds: number[] = [];
    if (!baseItemSets.length) {
        for (let index = 0; index < searchIndex.itemIdToTokens.length; index += 1) {
            matchingItemIds.push(index);
        }
    } else {
        const sortedSets = [...baseItemSets].sort((a, b) => (a?.size || 0) - (b?.size || 0));
        const smallestSet = sortedSets[0];
        const otherSets = sortedSets.slice(1);
        if (!smallestSet) {
            return [];
        }
        for (const itemId of smallestSet) {
            if (otherSets.every((itemSet) => itemSet?.has(itemId))) {
                matchingItemIds.push(itemId);
            }
        }
    }

    const options: SearchAutocompleteOption[] = [];
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

const stripBasePath = (pathname: string, basePath: string): string => {
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

export const parseServicePath = (value: string | null | undefined): string[] => {
    if (!value) {
        return [];
    }
    return value
        .split('/')
        .map((segment) => decodeURIComponent(segment))
        .filter(Boolean);
};

export const buildServicePath = (pathIds: string[]): string =>
    pathIds.map((segment) => encodeURIComponent(segment)).join('/');

export const buildItemPathname = (basePath: string, itemId: string): string => {
    const normalizedBase = basePath.endsWith('/') ? basePath.slice(0, -1) : basePath;
    const prefix = normalizedBase === '' ? '' : normalizedBase;
    return `${prefix}/item/${encodeURIComponent(itemId)}`;
};

export const buildItemRouteHref = (
    basePath: string,
    itemId: string,
    pathIds: string[] = [],
): string => {
    const pathname = buildItemPathname(basePath, itemId);
    if (!Array.isArray(pathIds) || pathIds.length === 0) {
        return pathname;
    }
    const params = new URLSearchParams();
    params.set('path', buildServicePath(pathIds));
    return `${pathname}?${params.toString()}`;
};

type PlainLeftClickEvent = {
    button: number;
    defaultPrevented: boolean;
    metaKey: boolean;
    ctrlKey: boolean;
    shiftKey: boolean;
    altKey: boolean;
};

export const isPlainLeftClick = (event: PlainLeftClickEvent): boolean =>
    event.button === 0 &&
    !event.defaultPrevented &&
    !event.metaKey &&
    !event.ctrlKey &&
    !event.shiftKey &&
    !event.altKey;

export const resolveNodeFromLocation = (
    nodes: CatalogTreeNode[],
    basePath: string,
): {node: CatalogTreeNode} | null => {
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

export const readLocationRouteContext = (
    basePath: string,
): {routeId: string; pathIds: string[]; hasRouteId: boolean; hasPathParam: boolean} => {
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
