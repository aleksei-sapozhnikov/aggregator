import type { CatalogItem, CatalogTreeNode, SearchAutocompleteIndex, SearchAutocompleteOption, SearchResult } from "../types";

export const normalizeSearchText = (value: string): string =>
  value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();

const matchSearch = (item: CatalogItem, queryTokens: string[]): boolean => {
  if (!queryTokens.length) {
    return true;
  }
  const name = normalizeSearchText(item.title || "");
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
      return { ...node, children: filteredChildren };
    }
    return null;
  };
  return nodes
    .map(visit)
    .filter((node): node is CatalogTreeNode => Boolean(node));
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
    const name = normalizeSearchText(item.title || "");
    if (!queryTokens.every((token) => name.includes(token))) {
      return;
    }
    let score = 0;
    queryTokens.forEach((token) => {
      if (name.includes(token)) {
        score += 3;
      }
    });
    results.push({ item, score });
  });
  return results.sort(
    (a, b) =>
      b.score - a.score ||
      (a.item.title || a.item.id).localeCompare(b.item.title || b.item.id),
  );
};

export const buildSearchAutocompleteIndex = (
  items: CatalogItem[],
): SearchAutocompleteIndex => {
  const tokenToItemIds = new Map<string, Set<number>>();
  const itemIdToTokens: string[][] = [];

  items.forEach((item, index) => {
    const tokens = [
      ...new Set(
        normalizeSearchText(item.title || "")
          .split(" ")
          .filter(Boolean),
      ),
    ];
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

  return { tokenToItemIds, itemIdToTokens };
};

const parseSearchAutocompleteQuery = (
  query: string,
): { baseTokens: string[]; currentToken: string } => {
  const rawQuery = query || "";
  const endsWithSpace = /\s$/.test(rawQuery);
  const normalizedQuery = normalizeSearchText(rawQuery);
  const tokens = normalizedQuery
    ? normalizedQuery.split(" ").filter(Boolean)
    : [];
  const baseTokens = endsWithSpace ? tokens : tokens.slice(0, -1);
  const currentToken = endsWithSpace ? "" : tokens[tokens.length - 1] || "";
  return { baseTokens, currentToken };
};

export const buildSearchAutocompleteOptions = (
  query: string,
  searchIndex: SearchAutocompleteIndex | null,
  limit = 12,
): SearchAutocompleteOption[] => {
  const { baseTokens, currentToken } = parseSearchAutocompleteQuery(query);
  if (!currentToken || !searchIndex) {
    return [];
  }

  const baseTokenSet = new Set<string>(baseTokens);
  const uniqueBaseTokens = [...baseTokenSet];
  const candidateWords = new Set<string>();
  const baseItemSets = uniqueBaseTokens.map((token) =>
    searchIndex.tokenToItemIds.get(token),
  );

  if (baseItemSets.some((itemSet) => !itemSet)) {
    return [];
  }

  const matchingItemIds: number[] = [];
  if (!baseItemSets.length) {
    for (let index = 0; index < searchIndex.itemIdToTokens.length; index += 1) {
      matchingItemIds.push(index);
    }
  } else {
    const sortedSets = [...baseItemSets].sort(
      (a, b) => (a?.size || 0) - (b?.size || 0),
    );
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
      const fullQuery = [...baseTokens, word].join(" ");
      options.push({ word, fullQuery });
      if (options.length >= limit) {
        return options.sort((a, b) => a.word.localeCompare(b.word));
      }
    }
  }
  return options.sort((a, b) => a.word.localeCompare(b.word));
};

