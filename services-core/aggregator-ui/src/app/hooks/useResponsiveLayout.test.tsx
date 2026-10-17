/** @vitest-environment jsdom */
/** @file Tests responsive sidebar state and mobile pointer gestures. */

import type { TouchEvent } from "react";
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import useResponsiveLayout from "./useResponsiveLayout";

function mockMatchMedia(initialMobile: boolean) {
  let matches = initialMobile;
  const listeners = new Set<(event: MediaQueryListEvent) => void>();
  const mediaQuery = {
    get matches() {
      return matches;
    },
    addEventListener: vi.fn(
      (event: string, listener: (value: MediaQueryListEvent) => void) => {
        if (event === "change") listeners.add(listener);
      },
    ),
    removeEventListener: vi.fn(
      (event: string, listener: (value: MediaQueryListEvent) => void) => {
        if (event === "change") listeners.delete(listener);
      },
    ),
  } as unknown as MediaQueryList;
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => mediaQuery),
  );
  return {
    mediaQuery,
    switchTo(mobile: boolean) {
      matches = mobile;
      act(() => {
        for (const listener of listeners) {
          listener({ matches: mobile } as MediaQueryListEvent);
        }
      });
    },
    get listenerCount() {
      return listeners.size;
    },
  };
}

const touch = (x: number, y: number): TouchEvent =>
  ({ touches: [{ clientX: x, clientY: y }] }) as unknown as TouchEvent;

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.documentElement.style.removeProperty("--app-viewport-height");
});

describe("useResponsiveLayout", () => {
  it("keeps desktop sidebar state when changing layouts and closes mobile sidebar on entry", () => {
    const media = mockMatchMedia(false);
    const { result, unmount } = renderHook(() => useResponsiveLayout());

    expect(result.current.isMobileLayout).toBe(false);
    expect(result.current.isSidebarOpen).toBe(true);
    expect(result.current.shouldOffsetContentHeader).toBe(false);
    act(() => result.current.handleToggleSidebar());
    expect(result.current.isSidebarOpen).toBe(false);
    expect(result.current.shouldOffsetContentHeader).toBe(true);

    media.switchTo(true);
    expect(result.current.isMobileLayout).toBe(true);
    expect(result.current.isMobileSidebarOpen).toBe(false);
    act(() => result.current.handleToggleSidebar());
    expect(result.current.isMobileSidebarOpen).toBe(true);

    media.switchTo(false);
    expect(result.current.isDesktopSidebarOpen).toBe(false);
    expect(result.current.isSidebarOpen).toBe(false);

    media.switchTo(true);
    expect(result.current.isMobileSidebarOpen).toBe(false);
    unmount();
    expect(media.listenerCount).toBe(0);
    expect(media.mediaQuery.removeEventListener).toHaveBeenCalled();
  });

  it("opens and closes the mobile panel with horizontal swipes", () => {
    mockMatchMedia(true);
    const { result } = renderHook(() => useResponsiveLayout());

    act(() => {
      result.current.handleMobileSidebarSwipeStart(touch(10, 100));
      result.current.handleMobileSidebarSwipeMove(touch(120, 108));
    });
    expect(result.current.isMobileSidebarOpen).toBe(true);

    act(() => {
      result.current.handleMobileSidebarSwipeStart(touch(210, 110));
      result.current.handleMobileSidebarSwipeMove(touch(100, 115));
    });
    expect(result.current.isMobileSidebarOpen).toBe(false);
  });

  it("ignores vertically drifting swipes and resets tracking on touch end", () => {
    mockMatchMedia(true);
    const { result } = renderHook(() => useResponsiveLayout());

    act(() => {
      result.current.handleMobileSidebarSwipeStart(touch(5, 10));
      result.current.handleMobileSidebarSwipeMove(touch(140, 90));
      result.current.handleMobileSidebarSwipeMove(touch(180, 12));
    });
    expect(result.current.isMobileSidebarOpen).toBe(false);

    act(() => {
      result.current.handleMobileSidebarSwipeStart(touch(5, 10));
      result.current.handleMobileSidebarSwipeEnd();
      result.current.handleMobileSidebarSwipeMove(touch(180, 12));
    });
    expect(result.current.isMobileSidebarOpen).toBe(false);
  });

  it("tracks visual viewport height and releases its listeners and CSS variable", () => {
    mockMatchMedia(false);
    const listeners = new Map<string, () => void>();
    const viewport = {
      height: 700,
      addEventListener: vi.fn((event: string, callback: () => void) =>
        listeners.set(event, callback),
      ),
      removeEventListener: vi.fn((event: string) => listeners.delete(event)),
    };
    const cancelAnimationFrame = vi.fn();
    vi.stubGlobal("visualViewport", viewport);
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
    vi.stubGlobal("cancelAnimationFrame", cancelAnimationFrame);

    const { unmount } = renderHook(() => useResponsiveLayout());
    expect(
      document.documentElement.style.getPropertyValue("--app-viewport-height"),
    ).toBe("700px");
    viewport.height = 560;
    act(() => listeners.get("resize")?.());
    expect(
      document.documentElement.style.getPropertyValue("--app-viewport-height"),
    ).toBe("560px");
    unmount();
    expect(listeners.size).toBe(0);
    expect(cancelAnimationFrame).toHaveBeenCalled();
    expect(
      document.documentElement.style.getPropertyValue("--app-viewport-height"),
    ).toBe("");
  });
});
