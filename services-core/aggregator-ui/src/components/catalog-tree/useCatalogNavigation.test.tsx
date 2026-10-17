/** @vitest-environment jsdom */
/** @file Tests catalog search, expansion, and scroll synchronization. */

import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildCatalogTree,
  collectNodeIds,
  findNodeByPath,
} from "../../shared/catalog/tree";
import type { CatalogDependency, CatalogItem } from "../../shared/types";
import useItemNavigation from "../../app/hooks/useItemNavigation";
import useCatalogNavigation from "./useCatalogNavigation";
import useCatalogSelectionSync from "./useCatalogSelectionSync";

const items: CatalogItem[] = [
  { id: "root", title: "Main Product" },
  { id: "alt", title: "Alternative Product" },
  { id: "child", title: "Checkout Service" },
  { id: "unrelated", title: "Shipping Service" },
];
const dependencies: CatalogDependency[] = [
  { sourceId: "root", targetId: "child" },
  { sourceId: "alt", targetId: "child" },
];

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  window.history.replaceState({}, "", "/");
});

describe("useCatalogNavigation", () => {
  it("filters the tree and ranks results without losing duplicate dependency paths", () => {
    const { result } = renderHook(() =>
      useCatalogNavigation({ items, dependencies }),
    );

    act(() => result.current.setSearchQuery("CHECKOUT"));
    expect(result.current.searchTokens).toEqual(["checkout"]);
    expect(
      result.current.searchResults.map((resultItem) => resultItem.item.id),
    ).toEqual(["child"]);
    expect(result.current.filteredTree).toHaveLength(2);
    expect(
      findNodeByPath(result.current.filteredTree, ["root", "child"]),
    ).not.toBeNull();
    expect(
      findNodeByPath(result.current.filteredTree, ["alt", "child"]),
    ).not.toBeNull();
    expect(result.current.tree).toHaveLength(3);
  });

  it("builds autocomplete asynchronously and clears it when items disappear", async () => {
    const { result, rerender } = renderHook(
      ({ list }) => useCatalogNavigation({ items: list, dependencies }),
      { initialProps: { list: items } },
    );
    act(() => result.current.setSearchQuery("chec"));
    await waitFor(() =>
      expect(result.current.isSearchAutocompleteReady).toBe(true),
    );
    expect(
      result.current.searchAutocompleteOptions.map((option) => option.word),
    ).toContain("checkout");

    rerender({ list: [] });
    expect(result.current.isSearchAutocompleteReady).toBe(false);
    expect(result.current.searchAutocompleteOptions).toEqual([]);
  });

  it("toggles branches and preserves the exact selected path on expand all", () => {
    const requestAnimationFrame = vi.fn(() => 1);
    vi.stubGlobal("requestAnimationFrame", requestAnimationFrame);
    const { result } = renderHook(() =>
      useCatalogNavigation({ items, dependencies }),
    );
    const rootNode = findNodeByPath(result.current.tree, ["root"]);
    const selectedNode = findNodeByPath(result.current.tree, ["alt", "child"]);
    expect(rootNode).not.toBeNull();
    expect(selectedNode).not.toBeNull();

    act(() => result.current.handleToggleNode(rootNode!));
    expect(result.current.expandedIds.has("root")).toBe(true);
    act(() => result.current.handleToggleNode(rootNode!));
    expect(result.current.expandedIds.has("root")).toBe(false);

    act(() => result.current.handleExpandAll("child", ["alt", "child"]));
    expect(result.current.expandedIds.has("alt")).toBe(true);
    expect(result.current.expandedIds.has("root")).toBe(true);
    expect(result.current.pendingScrollId).toBe(selectedNode!.uid);

    act(() => result.current.handleCollapseAll());
    expect(result.current.expandedIds.size).toBe(0);
    expect(result.current.pendingScrollId).toBe("");
    expect(requestAnimationFrame).toHaveBeenCalled();
  });

  it("closes active search on Escape", () => {
    const { result } = renderHook(() =>
      useCatalogNavigation({ items, dependencies }),
    );
    act(() => {
      result.current.setSearchQuery("checkout");
      result.current.setIsSearchActive(true);
    });
    act(() =>
      window.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", cancelable: true }),
      ),
    );
    expect(result.current.searchQuery).toBe("");
    expect(result.current.isSearchActive).toBe(false);
  });
});

describe("catalog tree cycles", () => {
  it("keeps rootless cyclic groups visible without recursive loops", () => {
    const cycleItems: CatalogItem[] = [
      { id: "alpha", title: "Alpha" },
      { id: "beta", title: "Beta" },
      { id: "independent", title: "Independent" },
    ];
    const cycleDependencies: CatalogDependency[] = [
      { sourceId: "alpha", targetId: "beta" },
      { sourceId: "beta", targetId: "alpha" },
    ];
    const tree = buildCatalogTree(cycleItems, cycleDependencies);
    expect(tree.map((node) => node.item.id)).toEqual(["independent", "alpha"]);
    expect(new Set(collectNodeIds(tree))).toEqual(
      new Set(["independent", "alpha", "beta"]),
    );
    expect(findNodeByPath(tree, ["alpha", "beta"])).not.toBeNull();
  });
});

describe("catalog selection synchronization", () => {
  it("restores the selected branch after clearing search without changing the Item route", () => {
    const setIsMobileSidebarOpen = vi.fn();
    const { result } = renderHook(() => {
      const catalog = useCatalogNavigation({ items, dependencies });
      const selected = useItemNavigation({
        basePath: "/",
        tree: catalog.tree,
        itemMap: catalog.itemMap,
        expandedIdsRef: catalog.expandedIdsRef,
        setPendingScrollId: catalog.setPendingScrollId,
        setIsMobileSidebarOpen,
        expandPathToItem: catalog.expandPathToItem,
        ensurePathExpanded: catalog.ensurePathExpanded,
      });
      useCatalogSelectionSync({
        navigation: catalog,
        selectedId: selected.selectedId,
        selectedNode: selected.selectedNode,
        isMobileLayout: false,
        isSidebarOpen: true,
      });
      return { catalog, selected };
    });

    act(() => result.current.selected.handleSelectItemByPath(["alt", "child"]));
    expect(result.current.selected.selectedPath).toEqual(["alt", "child"]);

    act(() => {
      result.current.catalog.setSearchQuery("checkout");
      result.current.catalog.setIsSearchActive(true);
    });
    act(() => result.current.catalog.handleClearSearch());

    expect(result.current.selected.selectedPath).toEqual(["alt", "child"]);
    expect(result.current.catalog.expandedIds.has("alt")).toBe(true);
    expect(result.current.catalog.pendingScrollId).toBe(
      findNodeByPath(result.current.catalog.tree, ["alt", "child"])?.uid,
    );
    expect(new URLSearchParams(window.location.search).get("path")).toBe(
      "alt/child",
    );
  });
});
