/**
 * Synchronizes catalog search reset and pending tree scrolling with a selected Item.
 * Kept separate to avoid a cyclic dependency on useItemNavigation.
 */
import { useEffect } from "react";
import { findNodeUidById } from "../../shared/catalog/tree";
import type { CatalogTreeNode } from "../../shared/types";
import type useCatalogNavigation from "./useCatalogNavigation";

type CatalogSelectionSyncOptions = {
  navigation: ReturnType<typeof useCatalogNavigation>;
  selectedId: string;
  selectedNode: CatalogTreeNode | null;
  isMobileLayout: boolean;
  isSidebarOpen: boolean;
};

export default function useCatalogSelectionSync({
  navigation,
  selectedId,
  selectedNode,
  isMobileLayout,
  isSidebarOpen,
}: CatalogSelectionSyncOptions) {
  const {
    tree,
    searchTokens,
    isSearchActive,
    pendingScrollId,
    setPendingScrollId,
    previousSearchTokensRef,
    clearSearchRequestedRef,
    ensurePathExpanded,
    expandPathToItem,
    scrollToNodeId,
  } = navigation;

  useEffect(() => {
    const prevTokens = previousSearchTokensRef.current;
    previousSearchTokensRef.current = searchTokens.length;
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
        setPendingScrollId(selectedNode.uid || "");
      } else {
        expandPathToItem(selectedId);
        const selectedUid = findNodeUidById(tree, selectedId);
        setPendingScrollId(selectedUid || "");
      }
      return;
    }
    if (clearSearchRequestedRef.current) {
      clearSearchRequestedRef.current = false;
    }
  }, [
    ensurePathExpanded,
    expandPathToItem,
    isSearchActive,
    searchTokens.length,
    selectedId,
    selectedNode,
    tree,
  ]);

  useEffect(() => {
    if (!pendingScrollId || searchTokens.length > 0) {
      return;
    }
    const shouldAnimateScroll = !isMobileLayout && isSidebarOpen;
    scrollToNodeId(pendingScrollId, shouldAnimateScroll ? "smooth" : "auto");
  }, [
    isMobileLayout,
    isSidebarOpen,
    pendingScrollId,
    scrollToNodeId,
    searchTokens.length,
  ]);
}
