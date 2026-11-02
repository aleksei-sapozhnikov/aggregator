/** @vitest-environment jsdom */
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CatalogTreeNode } from "../../shared/types";
import useItemNavigation from "./useItemNavigation";

const child: CatalogTreeNode = {
  item: { id: "checkout", title: "Checkout" },
  children: [],
  uid: "root/checkout",
  path: ["root", "checkout"],
};
const root: CatalogTreeNode = {
  item: { id: "root", title: "Root" },
  children: [child],
  uid: "root",
  path: ["root"],
};
const alternateChild: CatalogTreeNode = {
  item: child.item,
  children: [],
  uid: "other/checkout",
  path: ["other", "checkout"],
};
const other: CatalogTreeNode = {
  item: { id: "other", title: "Other" },
  children: [alternateChild],
  uid: "other",
  path: ["other"],
};
const tree = [root, other];

const setup = () => {
  const expandPathToItem = vi.fn();
  const ensurePathExpanded = vi.fn();
  const setPendingScrollId = vi.fn();
  const setIsMobileSidebarOpen = vi.fn();
  const expandedIdsRef = { current: new Set<string>() };
  const args = {
    basePath: "/",
    tree,
    itemMap: new Map(
      tree.flatMap((node) =>
        [node.item, ...node.children.map((nested) => nested.item)].map(
          (item) => [item.id, item] as const,
        ),
      ),
    ),
    expandedIdsRef,
    setPendingScrollId,
    setIsMobileSidebarOpen,
    expandPathToItem,
    ensurePathExpanded,
  };
  return { ...renderHook(() => useItemNavigation(args)), args };
};

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  window.history.replaceState({}, "", "/");
});

describe("useItemNavigation", () => {
  it("restores a deep-linked Item and preserves its explicit tree path", () => {
    window.history.replaceState({}, "", "/item/checkout?path=other%2Fcheckout");
    const { result, args } = setup();
    expect(result.current.selectedId).toBe("checkout");
    expect(result.current.selectedPath).toEqual(["other", "checkout"]);
    expect(result.current.selectedNode?.uid).toBe("other/checkout");
    expect(args.expandPathToItem).toHaveBeenCalledWith("checkout", {
      path: ["other", "checkout"],
    });
  });

  it("selects the exact dependency path without resolving an ambiguous Item ID", () => {
    const { result } = setup();
    act(() => result.current.handleSelectItemByPath(["other", "checkout"]));
    expect(result.current.selectedPath).toEqual(["other", "checkout"]);
    expect(window.location.pathname).toBe("/item/checkout");
    expect(new URLSearchParams(window.location.search).get("path")).toBe(
      "other/checkout",
    );
    expect(window.history.state).toEqual({
      itemId: "checkout",
      path: ["other", "checkout"],
    });
  });

  it("keeps the canonical URL pathless for Item links from other features", () => {
    const { result, args } = setup();
    act(() => result.current.handleSelectItemByIdNoPath("checkout"));
    expect(result.current.selectedId).toBe("checkout");
    expect(result.current.selectedPath).toEqual(["root", "checkout"]);
    expect(window.location.pathname).toBe("/item/checkout");
    expect(window.location.search).toBe("");
    expect(args.expandPathToItem).toHaveBeenCalledWith("checkout", {
      path: ["root", "checkout"],
    });
  });

  it("does not add duplicate history entries when the same node is selected again", () => {
    const { result } = setup();
    const push = vi.spyOn(window.history, "pushState");
    act(() => result.current.handleSelectItem(child));
    expect(push).toHaveBeenCalledTimes(1);
    act(() => result.current.handleSelectItem(child));
    expect(push).toHaveBeenCalledTimes(1);
  });

  it("restores browser navigation without resetting other expanded branches", () => {
    const { result, args } = setup();
    window.history.replaceState(
      { itemId: "checkout", path: ["other", "checkout"] },
      "",
      "/item/checkout?path=other%2Fcheckout",
    );
    args.expandPathToItem.mockClear();
    act(() => window.dispatchEvent(new PopStateEvent("popstate")));
    expect(result.current.selectedId).toBe("checkout");
    expect(result.current.selectedPath).toEqual(["other", "checkout"]);
    expect(args.ensurePathExpanded).toHaveBeenCalledWith(["other", "checkout"]);
    expect(args.expandPathToItem).not.toHaveBeenCalled();
  });

  it("keeps external Item links integrated with the in-app router", () => {
    const { result } = setup();
    act(() =>
      result.current.handleExternalItemLink("checkout", "/item/checkout"),
    );
    expect(result.current.selectedId).toBe("checkout");
    expect(window.location.pathname).toBe("/item/checkout");
    expect(
      result.current.buildItemLink("checkout", ["other", "checkout"]),
    ).toBe("/item/checkout?path=other%2Fcheckout");
  });
});
