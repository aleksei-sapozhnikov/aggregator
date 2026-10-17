/** @file Coordinates selected Item identity, route paths, browser history, and navigation actions. */

/**
 * Owns the selected Item route, browser history, deep links and navigation.
 * Catalog search, scrolling and panel layout belong to their feature modules.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Dispatch, RefObject, SetStateAction } from "react";
import {
  findNodeById,
  findNodeByPath,
  findNodePath,
  findNodeUidById,
} from "../../shared/catalog/tree";
import {
  buildItemPathname,
  buildItemRouteHref,
  buildServicePath,
  readLocationRouteContext,
  resolveNodeFromLocation,
} from "../../shared/navigation/itemRoutes";
import type { CatalogItem, CatalogTreeNode } from "../../shared/types";

type RouteUpdateOptions = { replace?: boolean };
type LocationSelectionOptions = {
  normalize?: boolean;
  preserveExpansion?: boolean;
};

type ItemNavigationOptions = {
  basePath: string;
  tree: CatalogTreeNode[];
  itemMap: Map<string, CatalogItem>;
  expandedIdsRef: RefObject<Set<string>>;
  setPendingScrollId: Dispatch<SetStateAction<string>>;
  setIsMobileSidebarOpen: Dispatch<SetStateAction<boolean>>;
  expandPathToItem: (itemId: string, options?: { path?: string[] }) => void;
  ensurePathExpanded: (pathIds: string[]) => void;
};

/** Synchronizes Item selection, tree paths, URL state, and browser history. */
export default function useItemNavigation({
  basePath,
  tree,
  itemMap,
  expandedIdsRef,
  setPendingScrollId,
  setIsMobileSidebarOpen,
  expandPathToItem,
  ensurePathExpanded,
}: ItemNavigationOptions) {
  const [selectedId, setSelectedId] = useState("");
  const [selectedPath, setSelectedPath] = useState<string[]>([]);
  const lastHistoryUrlRef = useRef(window.location.href);
  const lastHistoryKeyRef = useRef("");

  /**
   * Pushes/replaces browser history for an item route while deduplicating no-op updates.
   */
  const updateHistoryForRoute = useCallback(
    (
      itemId: string,
      pathIds: string[],
      { replace }: RouteUpdateOptions = {},
    ) => {
      if (!itemId) {
        return;
      }
      const normalizedPath = Array.isArray(pathIds) ? pathIds : [];
      const url = new URL(window.location.href);
      url.pathname = buildItemPathname(basePath, itemId);
      url.search = "";
      if (normalizedPath.length > 0) {
        url.searchParams.set("path", buildServicePath(normalizedPath));
      }
      const currentPathKey = Array.isArray(window.history.state?.path)
        ? window.history.state.path.join("/")
        : "";
      const targetPathKey = normalizedPath.join("/");
      const historyKey = `${itemId}::${targetPathKey}`;
      const nextUrl = url.toString();

      if (
        window.history.state?.itemId === itemId &&
        currentPathKey === targetPathKey
      ) {
        return;
      }
      if (
        nextUrl === window.location.href ||
        nextUrl === lastHistoryUrlRef.current ||
        historyKey === lastHistoryKeyRef.current
      ) {
        return;
      }

      const nextState = { itemId, path: normalizedPath };
      if (replace) {
        window.history.replaceState(nextState, "", url);
      } else {
        window.history.pushState(nextState, "", url);
      }
      lastHistoryUrlRef.current = nextUrl;
      lastHistoryKeyRef.current = historyKey;
    },
    [basePath],
  );

  /**
   * Updates route for an item id without preserving an explicit tree path.
   */
  const updateUrlForItemId = useCallback(
    (itemId: string, { replace }: RouteUpdateOptions = {}) => {
      updateHistoryForRoute(itemId, [], { replace });
    },
    [updateHistoryForRoute],
  );

  /**
   * Updates route using the selected tree node and its resolved path.
   */
  const updateUrlForNode = useCallback(
    (node: CatalogTreeNode | null, { replace }: RouteUpdateOptions = {}) => {
      if (!node) {
        return;
      }
      updateHistoryForRoute(node.item.id, node.path || [], { replace });
    },
    [updateHistoryForRoute],
  );

  /**
   * Normalizes route state after parsing browser location (same semantics, normalized path).
   */
  const normalizeUrlForRoute = useCallback(
    (
      itemId: string,
      pathIds: string[],
      { replace }: RouteUpdateOptions = {},
    ) => {
      updateHistoryForRoute(itemId, pathIds, { replace });
    },
    [updateHistoryForRoute],
  );

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

  /**
   * Selects a node from the tree and updates route with resolved path information.
   */
  const handleSelectItem = useCallback(
    (node: CatalogTreeNode) => {
      setSelectedId(node.item.id);
      setSelectedPath(node.path || [node.item.id]);
      setPendingScrollId(node.uid);
      setIsMobileSidebarOpen(false);
      updateUrlForNode(node);
    },
    [updateUrlForNode],
  );

  /**
   * Selects an item by id, using a resolved node path when available.
   */
  const handleSelectItemById = useCallback(
    (itemId: string) => {
      setSelectedId(itemId);
      const selectedNode = findNodeById(tree, itemId);
      if (selectedNode) {
        setSelectedPath(selectedNode.path || [itemId]);
        setPendingScrollId(selectedNode.uid);
        updateUrlForNode(selectedNode);
      } else {
        setSelectedPath([]);
        const selectedUid = findNodeUidById(tree, itemId);
        setPendingScrollId(selectedUid || "");
        updateUrlForItemId(itemId);
      }
      setIsMobileSidebarOpen(false);
    },
    [tree, updateUrlForItemId, updateUrlForNode],
  );

  /**
   * Selects an item by id and writes a pathless route (used by dependent item links).
   */
  const handleSelectItemByIdNoPath = useCallback(
    (itemId: string) => {
      const resolvedPath = findNodePath(tree, itemId) || [];
      setSelectedId(itemId);
      setSelectedPath(resolvedPath);
      const selectedUid = findNodeUidById(tree, itemId);
      setPendingScrollId(selectedUid || "");
      setIsMobileSidebarOpen(false);
      expandPathToItem(itemId, { path: resolvedPath });
      updateUrlForItemId(itemId);
    },
    [expandPathToItem, tree, updateUrlForItemId],
  );

  /**
   * Selects an item by an exact tree path to preserve duplicate-id branch context.
   */
  const handleSelectItemByPath = useCallback(
    (pathIds: string[]) => {
      const normalizedPath = Array.isArray(pathIds) ? pathIds : [];
      const itemId = normalizedPath[normalizedPath.length - 1] || "";
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
      setPendingScrollId(selectedUid || "");
      setIsMobileSidebarOpen(false);
      ensurePathExpanded(normalizedPath);
      normalizeUrlForRoute(itemId, normalizedPath);
    },
    [ensurePathExpanded, normalizeUrlForRoute, tree, updateUrlForNode],
  );

  /**
   * Builds an item link under the current base path.
   */
  const buildItemLink = useCallback(
    (itemId: string, pathIds: string[] = []) => {
      return buildItemRouteHref(basePath, itemId, pathIds);
    },
    [basePath],
  );

  const handleExternalItemLink = useCallback(
    (itemId: string, href: string) => {
      if (itemMap.has(itemId)) {
        handleSelectItemByIdNoPath(itemId);
      } else if (href) {
        window.location.assign(href);
      }
    },
    [handleSelectItemByIdNoPath, itemMap],
  );

  /**
   * Sync selected item with browser URL and handle browser back/forward navigation.
   * Also normalizes invalid/missing route states to the closest resolvable node.
   */
  useEffect(() => {
    if (!tree.length) {
      return undefined;
    }
    const applySelectionFromLocation = (
      options: LocationSelectionOptions = {},
    ) => {
      const { normalize = true, preserveExpansion = false } = options;
      const routeContext = readLocationRouteContext(basePath);
      const resolved = resolveNodeFromLocation(tree, basePath);
      if (!resolved) {
        if (normalize && routeContext.hasRouteId) {
          normalizeUrlForRoute(routeContext.routeId, routeContext.pathIds, {
            replace: true,
          });
          return;
        }
        if (!routeContext.hasPathParam) {
          const fallbackNode = tree[0] || null;
          const fallbackId = fallbackNode?.item?.id || "";
          setSelectedId(fallbackId);
          setSelectedPath(
            fallbackNode?.path || (fallbackId ? [fallbackId] : []),
          );
          setPendingScrollId(fallbackNode?.uid || "");
          setIsMobileSidebarOpen(false);
          if (normalize && fallbackId) {
            updateUrlForNode(fallbackNode, { replace: true });
          }
        }
        return;
      }
      const { node } = resolved;
      setSelectedId(node.item.id);
      setSelectedPath(node.path || [node.item.id]);
      setPendingScrollId(node.uid);
      if (!preserveExpansion) {
        setIsMobileSidebarOpen(false);
        expandPathToItem(node.item.id, { path: node.path });
      } else {
        const ancestorIds = node.path?.slice(0, -1) || [];
        const needsExpand = ancestorIds.some(
          (id) => !expandedIdsRef.current.has(id),
        );
        if (needsExpand) {
          ensurePathExpanded(node.path);
        }
      }
      if (normalize && (routeContext.hasRouteId || routeContext.hasPathParam)) {
        updateUrlForNode(node, { replace: true });
      }
    };

    applySelectionFromLocation({ normalize: true });

    /** Restores the selected Item and dependency path when browser history changes. */
    const handlePopState = () => {
      lastHistoryUrlRef.current = window.location.href;
      if (window.history.state?.itemId) {
        const stateItemId = window.history.state.itemId;
        const statePath = Array.isArray(window.history.state.path)
          ? window.history.state.path
          : [];
        lastHistoryKeyRef.current = `${stateItemId}::${statePath.join("/")}`;
      } else {
        lastHistoryKeyRef.current = "";
      }
      applySelectionFromLocation({ normalize: false, preserveExpansion: true });
    };
    window.addEventListener("popstate", handlePopState);
    return () => {
      window.removeEventListener("popstate", handlePopState);
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

  return {
    selectedId,
    selectedPath,
    selectedNode,
    initializeSelectedId: setSelectedId,
    handleSelectItem,
    handleSelectItemById,
    handleSelectItemByIdNoPath,
    handleSelectItemByPath,
    buildItemLink,
    handleExternalItemLink,
  };
}
