/**
 * Owns responsive catalog visibility, mobile swipe gestures and visual viewport height.
 * Routing, catalog search and Item data remain outside this hook.
 */
import type { TouchEvent } from "react";
import { useCallback, useEffect, useRef, useState } from "react";

const MOBILE_BREAKPOINT = 900;
const MOBILE_SWIPE_OPEN_DISTANCE_PX = 96;
const MOBILE_SWIPE_CLOSE_DISTANCE_PX = 96;
const MOBILE_SWIPE_MAX_VERTICAL_DRIFT_PX = 48;

export default function useResponsiveLayout() {
  const [isMobileLayout, setIsMobileLayout] = useState(
    () => window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT}px)`).matches,
  );
  const [isDesktopSidebarOpen, setIsDesktopSidebarOpen] = useState(true);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const sidebarSwipeStartXRef = useRef<number | null>(null);
  const sidebarSwipeStartYRef = useRef<number | null>(null);

  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) {
      return undefined;
    }

    let frameId = 0;
    const updateViewportHeight = () => {
      if (frameId) {
        window.cancelAnimationFrame(frameId);
      }
      frameId = window.requestAnimationFrame(() => {
        document.documentElement.style.setProperty(
          "--app-viewport-height",
          `${viewport.height}px`,
        );
      });
    };

    updateViewportHeight();
    viewport.addEventListener("resize", updateViewportHeight);
    viewport.addEventListener("scroll", updateViewportHeight);

    return () => {
      if (frameId) {
        window.cancelAnimationFrame(frameId);
      }
      viewport.removeEventListener("resize", updateViewportHeight);
      viewport.removeEventListener("scroll", updateViewportHeight);
      document.documentElement.style.removeProperty("--app-viewport-height");
    };
  }, []);

  useEffect(() => {
    const mediaQuery = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT}px)`);
    const updateLayout = (event: MediaQueryListEvent) => {
      setIsMobileLayout(event.matches);
    };

    setIsMobileLayout(mediaQuery.matches);
    mediaQuery.addEventListener("change", updateLayout);

    return () => {
      mediaQuery.removeEventListener("change", updateLayout);
    };
  }, []);

  useEffect(() => {
    if (isMobileLayout) {
      setIsMobileSidebarOpen(false);
    }
  }, [isMobileLayout]);

  const isSidebarOpen = isMobileLayout
    ? isMobileSidebarOpen
    : isDesktopSidebarOpen;
  const shouldOffsetContentHeader = isMobileLayout || !isSidebarOpen;
  /**
   * Toggles sidebar visibility for desktop and mobile layouts.
   */
  const handleToggleSidebar = useCallback(() => {
    if (isMobileLayout) {
      setIsMobileSidebarOpen((prev) => !prev);
      return;
    }
    setIsDesktopSidebarOpen((prev) => !prev);
  }, [isMobileLayout]);

  /**
   * Tracks swipe state for mobile sidebar gestures.
   */
  const handleMobileSidebarSwipeStart = useCallback(
    (event: TouchEvent) => {
      if (!isMobileLayout) {
        sidebarSwipeStartXRef.current = null;
        sidebarSwipeStartYRef.current = null;
        return;
      }
      const touch = event.touches?.[0];
      if (!touch) {
        sidebarSwipeStartXRef.current = null;
        sidebarSwipeStartYRef.current = null;
        return;
      }
      sidebarSwipeStartXRef.current = touch.clientX;
      sidebarSwipeStartYRef.current = touch.clientY;
    },
    [isMobileLayout],
  );

  /**
   * Opens or closes the mobile sidebar when a horizontal swipe is detected.
   */
  const handleMobileSidebarSwipeMove = useCallback(
    (event: TouchEvent) => {
      const startX = sidebarSwipeStartXRef.current;
      const startY = sidebarSwipeStartYRef.current;
      if (startX === null || startY === null || !isMobileLayout) {
        return;
      }
      const touch = event.touches?.[0];
      if (!touch) {
        return;
      }
      const deltaX = touch.clientX - startX;
      const deltaY = Math.abs(touch.clientY - startY);
      if (deltaY > MOBILE_SWIPE_MAX_VERTICAL_DRIFT_PX) {
        sidebarSwipeStartXRef.current = null;
        sidebarSwipeStartYRef.current = null;
        return;
      }
      if (!isMobileSidebarOpen && deltaX >= MOBILE_SWIPE_OPEN_DISTANCE_PX) {
        setIsMobileSidebarOpen(true);
        sidebarSwipeStartXRef.current = null;
        sidebarSwipeStartYRef.current = null;
        return;
      }
      if (isMobileSidebarOpen && deltaX <= -MOBILE_SWIPE_CLOSE_DISTANCE_PX) {
        setIsMobileSidebarOpen(false);
        sidebarSwipeStartXRef.current = null;
        sidebarSwipeStartYRef.current = null;
      }
    },
    [isMobileLayout, isMobileSidebarOpen],
  );

  /**
   * Resets swipe tracking after touch end/cancel.
   */
  const handleMobileSidebarSwipeEnd = useCallback(() => {
    sidebarSwipeStartXRef.current = null;
    sidebarSwipeStartYRef.current = null;
  }, []);

  return {
    isMobileLayout,
    isDesktopSidebarOpen,
    isMobileSidebarOpen,
    setIsMobileSidebarOpen,
    isSidebarOpen,
    shouldOffsetContentHeader,
    handleToggleSidebar,
    handleMobileSidebarSwipeStart,
    handleMobileSidebarSwipeMove,
    handleMobileSidebarSwipeEnd,
  };
}
