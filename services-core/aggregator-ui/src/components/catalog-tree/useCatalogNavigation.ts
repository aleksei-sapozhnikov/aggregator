/**
 * Owns the catalog tree, search state, autocomplete, expansion, and tree scrolling.
 * Selected Item routes are owned separately by useItemNavigation.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { buildCatalogTree, collectDescendantIds, collectExpandableIds, findNodeByPath, findNodePath, findNodeUidById } from "../../shared/catalog/tree";
import { buildSearchAutocompleteIndex, buildSearchAutocompleteOptions, filterCatalogTree, normalizeSearchText, rankSearchResults } from "../../shared/catalog/search";
import type { CatalogDependency, CatalogItem, CatalogTreeNode, SearchAutocompleteIndex } from "../../shared/types";

const TREE_SCROLL_LONG_DISTANCE_PX = 600;
const TREE_SCROLL_SMOOTH_SEGMENT_PX = 360;

type CatalogNavigationOptions = {
  items: CatalogItem[];
  dependencies: CatalogDependency[];
};

export default function useCatalogNavigation({ items, dependencies }: CatalogNavigationOptions) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set<string>());
  const expandedIdsRef = useRef(expandedIds);
  const [isSearchActive, setIsSearchActive] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchAutocompleteIndex, setSearchAutocompleteIndex] = useState<SearchAutocompleteIndex | null>(null);
  const [isSearchAutocompleteReady, setIsSearchAutocompleteReady] = useState(false);
  const [pendingScrollId, setPendingScrollId] = useState("");
  const previousSearchTokensRef = useRef(0);
  const clearSearchRequestedRef = useRef(false);
  const catalogTreeRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    expandedIdsRef.current = expandedIds;
  }, [expandedIds]);


  useEffect(() => {
    if (!items.length) {
      setSearchAutocompleteIndex(null);
      setIsSearchAutocompleteReady(false);
      return undefined;
    }

    let cancelled = false;
    setSearchAutocompleteIndex(null);
    setIsSearchAutocompleteReady(false);

    const buildIndex = () => {
      const nextIndex = buildSearchAutocompleteIndex(items);
      if (cancelled) {
        return;
      }
      setSearchAutocompleteIndex(nextIndex);
      setIsSearchAutocompleteReady(true);
    };

    let timeoutId = 0;
    let idleId = 0;

    if (typeof window.requestIdleCallback === "function") {
      idleId = window.requestIdleCallback(buildIndex);
    } else {
      timeoutId = window.setTimeout(buildIndex, 0);
    }

    return () => {
      cancelled = true;
      if (idleId && typeof window.cancelIdleCallback === "function") {
        window.cancelIdleCallback(idleId);
      }
      if (timeoutId) {
        window.clearTimeout(timeoutId);
      }
    };
  }, [items]);


  const tree = useMemo(
    () => buildCatalogTree(items, dependencies),
    [items, dependencies],
  );
  const itemMap = useMemo(
    () => new Map(items.map((item) => [item.id, item])),
    [items],
  );
  const searchTokens = useMemo(
    () => normalizeSearchText(searchQuery).split(" ").filter(Boolean),
    [searchQuery],
  );
  const filteredTree = useMemo(
    () => filterCatalogTree(tree, searchTokens),
    [tree, searchTokens],
  );
  const searchResults = useMemo(
    () => rankSearchResults(items, searchTokens),
    [items, searchTokens],
  );
  const searchAutocompleteOptions = useMemo(
    () => buildSearchAutocompleteOptions(searchQuery, searchAutocompleteIndex),
    [searchQuery, searchAutocompleteIndex],
  );


  const handleToggleNode = useCallback((node: CatalogTreeNode) => {
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
  const expandPathToItem = useCallback(
    (itemId: string, { path }: { path?: string[] } = {}) => {
      const resolvedPath =
        path && path.length ? path : findNodePath(tree, itemId);
      const ancestors = resolvedPath ? resolvedPath.slice(0, -1) : [];
      setExpandedIds(new Set(ancestors));
    },
    [tree],
  );

  /**
   * Ensures ancestors in a known path are expanded without resetting other expanded branches.
   */
  const ensurePathExpanded = useCallback((pathIds: string[]) => {
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
  const handleExpandAll = useCallback((selectedId: string, selectedPath: string[]) => {
    setExpandedIds(new Set(collectExpandableIds(tree)));
    if (!selectedId) {
      return;
    }
    const selectedUid =
      selectedPath.length > 0
        ? findNodeByPath(tree, selectedPath)?.uid || ""
        : findNodeUidById(tree, selectedId) || "";
    if (selectedUid) {
      setPendingScrollId(selectedUid);
    }
  }, [selectedId, selectedPath, tree]);

  /**
   * Collapses the full tree and resets the catalog scroll position to the top.
   */
  const handleCollapseAll = useCallback(() => {
    setExpandedIds(new Set());
    setPendingScrollId("");
    window.requestAnimationFrame(() => {
      catalogTreeRef.current?.scrollTo({
        top: 0,
        behavior: "auto",
      });
    });
  }, []);


  /**
   * Clears search text and exits search-results mode.
   */
  const handleClearSearch = useCallback(() => {
    clearSearchRequestedRef.current = true;
    setSearchQuery("");
    setIsSearchActive(false);
  }, []);


  useEffect(() => {
    if (!isSearchActive) {
      return undefined;
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        handleClearSearch();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [handleClearSearch, isSearchActive]);


  /**
   * Scrolls the tree container to a node once it is rendered and measurable.
   */
  const scrollToNodeId = useCallback(
    (targetId: string, behavior: ScrollBehavior) => {
      const container = catalogTreeRef.current;
      if (!container) {
        return;
      }
      const animateScrollTo = (nextTop: number) => {
        const startTop = container.scrollTop;
        const targetTop = Math.max(0, nextTop);
        const distance = Math.abs(targetTop - startTop);
        if (distance < 1) {
          container.scrollTop = targetTop;
          return;
        }
        if (behavior !== "smooth") {
          container.scrollTop = targetTop;
          return;
        }
        if (distance > TREE_SCROLL_LONG_DISTANCE_PX) {
          const direction = targetTop > startTop ? 1 : -1;
          const prejumpTop =
            direction > 0
              ? Math.max(startTop, targetTop - TREE_SCROLL_SMOOTH_SEGMENT_PX)
              : Math.min(startTop, targetTop + TREE_SCROLL_SMOOTH_SEGMENT_PX);
          if (Math.abs(prejumpTop - startTop) >= 1) {
            container.scrollTop = prejumpTop;
          }
        }
        container.scrollTo({
          top: targetTop,
          behavior: "smooth",
        });
      };
      const startedAt = performance.now();
      const tryScroll = () => {
        const node = container.querySelector<HTMLElement>(
          `[data-node-id="${targetId}"]`,
        );
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
          let current: HTMLElement | null = node;
          while (current && current !== container) {
            offset += current.offsetTop;
            const nextParent: Element | null = current.offsetParent;
            current = nextParent instanceof HTMLElement ? nextParent : null;
          }
          const targetViewportOffset = container.clientHeight / 3;
          let nextTop;
          if (current === container) {
            const maxScrollTop = Math.max(
              0,
              container.scrollHeight - container.clientHeight,
            );
            nextTop = Math.min(
              Math.max(0, offset - targetViewportOffset),
              maxScrollTop,
            );
          } else {
            const containerRect = container.getBoundingClientRect();
            const fallbackOffset = nodeRect.top - containerRect.top;
            const maxScrollTop = Math.max(
              0,
              container.scrollHeight - container.clientHeight,
            );
            nextTop = Math.min(
              Math.max(
                0,
                container.scrollTop + fallbackOffset - targetViewportOffset,
              ),
              maxScrollTop,
            );
          }
          animateScrollTo(nextTop);
          setPendingScrollId("");
          return;
        }
        if (performance.now() - startedAt < 2000) {
          window.requestAnimationFrame(tryScroll);
          return;
        }
        setPendingScrollId("");
      };
      window.requestAnimationFrame(tryScroll);
    },
    [],
  );


  return {
    tree,
    itemMap,
    expandedIds,
    expandedIdsRef,
    searchQuery,
    setSearchQuery,
    isSearchActive,
    setIsSearchActive,
    searchTokens,
    filteredTree,
    searchResults,
    isSearchAutocompleteReady,
    searchAutocompleteOptions,
    pendingScrollId,
    setPendingScrollId,
    catalogTreeRef,
    previousSearchTokensRef,
    clearSearchRequestedRef,
    handleToggleNode,
    expandPathToItem,
    ensurePathExpanded,
    handleExpandAll,
    handleCollapseAll,
    handleClearSearch,
    scrollToNodeId,
  };
}
