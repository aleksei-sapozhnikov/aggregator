/** @file Measures the header to keep the Item heading clear of toolbar controls. */

import { useEffect, useRef, useState } from "react";

type TitlePlacementOptions = {
  isMobileLayout: boolean;
  isMobileSidebarOpen: boolean;
  isDesktopSidebarOpen: boolean;
  selectedId: string;
  selectedTitleFirstWord: string;
};

export default function useTitlePlacement({
  isMobileLayout,
  isMobileSidebarOpen,
  isDesktopSidebarOpen,
  selectedId,
  selectedTitleFirstWord,
}: TitlePlacementOptions) {
  const [isTitlePrimaryBelowControls, setIsTitlePrimaryBelowControls] =
    useState(false);
  const headerRef = useRef<HTMLElement | null>(null);
  const headerActionsRef = useRef<HTMLDivElement | null>(null);
  const contentTitlePrimaryRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const measurePrimaryWidth = (element: HTMLElement): number => {
      const clone = element.cloneNode(true) as HTMLElement;
      clone.style.position = "fixed";
      clone.style.left = "-99999px";
      clone.style.top = "-99999px";
      clone.style.visibility = "hidden";
      clone.style.pointerEvents = "none";
      clone.style.width = "max-content";
      clone.style.maxWidth = "none";
      clone.style.whiteSpace = "nowrap";
      document.body.appendChild(clone);
      const width = clone.getBoundingClientRect().width;
      clone.remove();
      return width;
    };

    const updateTitlePrimaryPlacement = () => {
      if (
        !headerRef.current ||
        !headerActionsRef.current ||
        !contentTitlePrimaryRef.current
      ) {
        setIsTitlePrimaryBelowControls(false);
        return;
      }

      const sidebarOpen = isMobileLayout
        ? isMobileSidebarOpen
        : isDesktopSidebarOpen;
      const shouldOffsetHeaderInline = isMobileLayout || !sidebarOpen;
      const inlineLeftOffset = shouldOffsetHeaderInline
        ? isMobileLayout
          ? 52
          : 56
        : 0;
      const headerStyles = window.getComputedStyle(headerRef.current);
      const gap =
        Number.parseFloat(headerStyles.columnGap || headerStyles.gap) || 12;
      const actionsRectWidth =
        headerActionsRef.current.getBoundingClientRect().width;
      const actionsStyles = window.getComputedStyle(headerActionsRef.current);
      const actionsMarginLeft =
        Number.parseFloat(actionsStyles.marginLeft) || 0;
      const actionsMarginRight =
        Number.parseFloat(actionsStyles.marginRight) || 0;
      const actionsWidth = Math.ceil(
        actionsRectWidth + actionsMarginLeft + actionsMarginRight,
      );
      const primaryWidth = Math.ceil(
        measurePrimaryWidth(contentTitlePrimaryRef.current),
      );
      const availableInlineWidth = Math.max(
        0,
        headerRef.current.clientWidth - actionsWidth - gap - inlineLeftOffset,
      );
      const actionsRect = headerActionsRef.current.getBoundingClientRect();
      const primaryRect =
        contentTitlePrimaryRef.current.getBoundingClientRect();
      const primaryAlreadyBelowControls =
        primaryRect.top >= actionsRect.bottom - 2;
      const shouldForceBelowByWidth = primaryWidth > availableInlineWidth + 6;
      const canReturnInlineByWidth = primaryWidth <= availableInlineWidth - 16;

      setIsTitlePrimaryBelowControls((prev) => {
        if (prev) {
          return !canReturnInlineByWidth;
        }
        return shouldForceBelowByWidth || primaryAlreadyBelowControls;
      });
    };

    updateTitlePrimaryPlacement();

    window.addEventListener("resize", updateTitlePrimaryPlacement);
    let observer: ResizeObserver | undefined;
    if (window.ResizeObserver) {
      const nextObserver = new ResizeObserver(updateTitlePrimaryPlacement);
      [
        headerRef.current,
        headerActionsRef.current,
        contentTitlePrimaryRef.current,
      ]
        .filter((element): element is HTMLElement => Boolean(element))
        .forEach((element) => nextObserver.observe(element));
      observer = nextObserver;
    }

    return () => {
      window.removeEventListener("resize", updateTitlePrimaryPlacement);
      if (observer) {
        observer.disconnect();
      }
    };
  }, [
    isMobileLayout,
    isMobileSidebarOpen,
    isDesktopSidebarOpen,
    selectedId,
    selectedTitleFirstWord,
  ]);

  return {
    isTitlePrimaryBelowControls,
    headerRef,
    headerActionsRef,
    contentTitlePrimaryRef,
  };
}
