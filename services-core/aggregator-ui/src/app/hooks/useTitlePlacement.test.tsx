/** @vitest-environment jsdom */
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import useTitlePlacement from "./useTitlePlacement";

const rect = (width: number, top = 0, bottom = 0): DOMRect =>
  ({ width, top, bottom, height: bottom - top }) as DOMRect;

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});

describe("useTitlePlacement", () => {
  it("moves a title below controls only when inline space is insufficient", () => {
    const header = document.createElement("header");
    const actions = document.createElement("div");
    const primary = document.createElement("span");
    header.append(actions, primary);
    document.body.appendChild(header);
    Object.defineProperty(header, "clientWidth", { value: 400, configurable: true });
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      if (this === actions) return rect(120, 0, 20);
      if (this === primary) return rect(300, 0, 12);
      if (this.style.position === "fixed") return rect(300);
      return rect(400);
    });

    const { result, rerender, unmount } = renderHook(
      ({ selectedId }) => useTitlePlacement({
        isMobileLayout: false,
        isMobileSidebarOpen: false,
        isDesktopSidebarOpen: true,
        selectedId,
        selectedTitleFirstWord: "Checkout",
      }),
      { initialProps: { selectedId: "" } },
    );
    result.current.headerRef.current = header;
    result.current.headerActionsRef.current = actions;
    result.current.contentTitlePrimaryRef.current = primary;
    rerender({ selectedId: "checkout" });
    expect(result.current.isTitlePrimaryBelowControls).toBe(true);

    Object.defineProperty(header, "clientWidth", { value: 800, configurable: true });
    act(() => window.dispatchEvent(new Event("resize")));
    expect(result.current.isTitlePrimaryBelowControls).toBe(false);
    unmount();
  });

  it("removes ResizeObserver and resize listener on cleanup", () => {
    const header = document.createElement("header");
    const actions = document.createElement("div");
    const primary = document.createElement("span");
    const observe = vi.fn();
    const disconnect = vi.fn();
    vi.stubGlobal("ResizeObserver", class {
      observe = observe;
      disconnect = disconnect;
    });
    const { result, rerender, unmount } = renderHook(
      ({ selectedId }) => useTitlePlacement({
        isMobileLayout: false,
        isMobileSidebarOpen: false,
        isDesktopSidebarOpen: true,
        selectedId,
        selectedTitleFirstWord: "Operations",
      }),
      { initialProps: { selectedId: "" } },
    );
    result.current.headerRef.current = header;
    result.current.headerActionsRef.current = actions;
    result.current.contentTitlePrimaryRef.current = primary;
    rerender({ selectedId: "operations" });
    expect(observe).toHaveBeenCalledWith(header);
    expect(observe).toHaveBeenCalledWith(actions);
    expect(observe).toHaveBeenCalledWith(primary);
    const previous = disconnect.mock.calls.length;
    unmount();
    expect(disconnect.mock.calls.length).toBe(previous + 1);
  });
});
