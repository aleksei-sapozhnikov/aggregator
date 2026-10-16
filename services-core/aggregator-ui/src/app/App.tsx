/**
 * @file Main React application orchestrator for aggregator-ui.
 */

import type { TouchEvent } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import CatalogTree from "../components/catalog-tree/CatalogTree";
import AppLayout from "./AppLayout";
import ItemDetails from "../components/item-details/ItemDetails";
import AiChatPanel from "../components/ai-chat/AiChatPanel";
import AboutModal from "../components/about/application/AboutModal";
import ContactModal from "../components/entity-details/contact/ContactModal";
import ActorModal from "../components/entity-details/actor/ActorModal";
import HealthSignalModal from "../components/entity-details/signal/HealthSignalModal";
import useSignalDetails from "../components/entity-details/signal/useSignalDetails";
import useSelectedItemData from "../components/item-details/useSelectedItemData";
import useItemNavigation from "./hooks/useItemNavigation";
import useCatalogNavigation from "../components/catalog-tree/useCatalogNavigation";
import useCatalogSelectionSync from "../components/catalog-tree/useCatalogSelectionSync";
import {
  fetchProductHealth,
  getInitialTheme,
  loadCatalog,
  resolveBasePath,
  resolveCatalogTitle,
} from "../services/aggregatorApi";
import type {
  CatalogActor,
  CatalogActorContact,
  CatalogContact,
  CatalogDependency,
  CatalogItem,
  CatalogItemActor,
  CatalogItemContact,
  HealthStatus,
  ItemSignal,
  ProductHealthItem,
} from "../shared/types";

const MOBILE_BREAKPOINT = 900;
const MOBILE_SWIPE_OPEN_DISTANCE_PX = 96;
const MOBILE_SWIPE_CLOSE_DISTANCE_PX = 96;
const MOBILE_SWIPE_MAX_VERTICAL_DRIFT_PX = 48;
const TEMP_AI_CHAT_STORAGE_KEY = "aggregator-ui-ai-chat-enabled";
const EMPTY_CATALOG: {
  items: CatalogItem[];
  dependencies: CatalogDependency[];
  contacts: CatalogContact[];
  itemContacts: CatalogItemContact[];
  actors: CatalogActor[];
  itemActors: CatalogItemActor[];
  actorContacts: CatalogActorContact[];
} = {
  items: [],
  dependencies: [],
  contacts: [],
  itemContacts: [],
  actors: [],
  itemActors: [],
  actorContacts: [],
};

/**
 * TODO (2026-10): Temporary per-browser AI chat UX gate for the demo rollout.
 *
 * Enable in the browser console:
 *   localStorage.setItem("aggregator-ui-ai-chat-enabled", "true"); location.reload();
 *
 * Disable in the browser console:
 *   localStorage.removeItem("aggregator-ui-ai-chat-enabled"); location.reload();
 *
 * TODO (2026-10): Delete temp flag when AI feature is considered ready.
 * Delete this block and the related CSS classes when AI chat is ready for everyone.
 */
const isTemporaryAiChatEnabled = (): boolean =>
  localStorage.getItem(TEMP_AI_CHAT_STORAGE_KEY) === "true";

/**
 * Application orchestrator.
 * Owns cross-cutting state (selection, routing, polling, theme, responsive shell state)
 * and wires large UI blocks (CatalogTree, AppLayout, ItemDetails, AboutModal).
 */
export default function App() {
  const catalogTitle = resolveCatalogTitle();
  const isAiChatFeatureEnabled = useMemo(isTemporaryAiChatEnabled, []);
  const [catalog, setCatalog] = useState(EMPTY_CATALOG);
  const [error, setError] = useState("");
  const [theme, setTheme] = useState(getInitialTheme);

  const [itemStatuses, setItemStatuses] = useState<
    Record<string, HealthStatus>
  >({});
  const [itemSignals, setItemSignals] = useState<Record<string, ItemSignal[]>>(
    {},
  );
  const [productHealthByItemId, setProductHealthByItemId] = useState<
    Record<string, ProductHealthItem>
  >({});
  const [lastUpdated, setLastUpdated] = useState("");
  const [isMobileLayout, setIsMobileLayout] = useState(
    () => window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT}px)`).matches,
  );
  const [isDesktopSidebarOpen, setIsDesktopSidebarOpen] = useState(true);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [isTimelineOpen, setIsTimelineOpen] = useState(true);
  const [isAiChatOpen, setIsAiChatOpen] = useState(false);
  const [isAboutOpen, setIsAboutOpen] = useState(false);
  const { openedSignalId, openedSignalTitle, openSignal, closeSignal } =
    useSignalDetails();
  const [openedContact, setOpenedContact] = useState<CatalogContact | null>(
    null,
  );
  const [openedActorId, setOpenedActorId] = useState("");
  const [isTitlePrimaryBelowControls, setIsTitlePrimaryBelowControls] =
    useState(false);
  const contentRef = useRef<HTMLElement | null>(null);
  const headerRef = useRef<HTMLElement | null>(null);
  const headerActionsRef = useRef<HTMLDivElement | null>(null);
  const contentTitlePrimaryRef = useRef<HTMLElement | null>(null);
  const sidebarSwipeStartXRef = useRef<number | null>(null);
  const sidebarSwipeStartYRef = useRef<number | null>(null);

  const basePath = useMemo(resolveBasePath, []);
  const effectiveIsAiChatOpen = isAiChatFeatureEnabled && isAiChatOpen;

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
    document.body.dataset.theme = theme;
    localStorage.setItem("aggregator-ui-theme", theme);
  }, [theme]);

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

  useEffect(() => {
    const loadInitialCatalog = async () => {
      try {
        const {
          items,
          dependencies,
          contacts,
          itemContacts,
          actors,
          itemActors,
          actorContacts,
        } = await loadCatalog();
        setCatalog({
          items,
          dependencies,
          contacts,
          itemContacts,
          actors,
          itemActors,
          actorContacts,
        });
        initializeSelectedId((prev) => prev || items[0]?.id || "");
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Failed to load catalog");
      }
    };

    void loadInitialCatalog();
  }, []);

  useEffect(() => {
    if (!catalog.items.length) {
      return undefined;
    }

    let cancelled = false;

    const fetchStatuses = async () => {
      try {
        const next = await fetchProductHealth();
        if (!cancelled) {
          setItemStatuses(next.itemStatuses);
          setItemSignals(next.itemSignals);
          setProductHealthByItemId(
            Object.fromEntries(next.items.map((item) => [item.itemId, item])),
          );
          setLastUpdated(new Date().toLocaleTimeString());
        }
      } catch (err) {
        if (!cancelled) {
          console.error(err);
        }
      }
    };

    void fetchStatuses();
    const interval = window.setInterval(() => {
      void fetchStatuses();
    }, 10000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [catalog.items]);

  const catalogNavigation = useCatalogNavigation({
    items: catalog.items,
    dependencies: catalog.dependencies,
  });
  const {
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
    handleToggleNode,
    expandPathToItem,
    ensurePathExpanded,
    handleExpandAll,
    handleCollapseAll,
    handleClearSearch,
  } = catalogNavigation;

  const {
    selectedId,
    selectedPath,
    selectedNode,
    initializeSelectedId,
    handleSelectItem,
    handleSelectItemById,
    handleSelectItemByIdNoPath,
    handleSelectItemByPath,
    buildItemLink,
    handleExternalItemLink,
  } = useItemNavigation({
    basePath,
    tree,
    itemMap,
    expandedIdsRef,
    setPendingScrollId,
    setIsMobileSidebarOpen,
    expandPathToItem,
    ensurePathExpanded,
  });

  const {
    selectedItem,
    selectedStatus,
    selectedTitleFirstWord,
    selectedTitleRest,
    selectedFailingSignals,
    selectedPassingSignals,
    passingSignalsCount,
    failingDependencies,
    selectedItemActors,
    actorContactsByActorId,
    openedActor,
    openedActorContacts,
  } = useSelectedItemData({
    selectedId,
    selectedNode,
    itemMap,
    itemStatuses,
    itemSignals,
    catalog,
    openedActorId,
  });

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
  const isSidebarOpen = isMobileLayout
    ? isMobileSidebarOpen
    : isDesktopSidebarOpen;
  const shouldOffsetContentHeader = isMobileLayout || !isSidebarOpen;
  const homeHref = basePath || "/";
  const homeIconSrc = `${basePath || "/"}logo.svg`;
  const iconSpriteHref = `${basePath || "/"}icons.svg`;
  const searchSuggestionsListId = "item-search-suggestions";

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

  useEffect(() => {
    if (!selectedId) {
      return;
    }
    contentRef.current?.scrollTo({
      top: 0,
      behavior: "auto",
    });
  }, [selectedId]);

  useCatalogSelectionSync({
    navigation: catalogNavigation,
    selectedId,
    selectedNode,
    isMobileLayout,
    isSidebarOpen,
  });

  return (
    <div
      className={`app ${isMobileLayout ? "is-mobile" : "is-desktop"} ${
        isSidebarOpen ? "sidebar-open" : "sidebar-collapsed"
      } ${
        isAiChatFeatureEnabled
          ? "ai-chat-feature-enabled"
          : "ai-chat-feature-disabled"
      } ${effectiveIsAiChatOpen ? "ai-chat-open" : ""}`}
      onTouchStart={handleMobileSidebarSwipeStart}
      onTouchMove={handleMobileSidebarSwipeMove}
      onTouchEnd={handleMobileSidebarSwipeEnd}
      onTouchCancel={handleMobileSidebarSwipeEnd}
    >
      <CatalogTree
        isSidebarOpen={isSidebarOpen}
        homeHref={homeHref}
        homeIconSrc={homeIconSrc}
        iconSpriteHref={iconSpriteHref}
        onToggleSidebar={handleToggleSidebar}
        catalogTitle={catalogTitle}
        error={error}
        tree={tree}
        searchQuery={searchQuery}
        searchSuggestionsListId={searchSuggestionsListId}
        isSearchAutocompleteReady={isSearchAutocompleteReady}
        searchAutocompleteOptions={searchAutocompleteOptions}
        setSearchQuery={setSearchQuery}
        isSearchActive={isSearchActive}
        setIsSearchActive={setIsSearchActive}
        onClearSearch={handleClearSearch}
        onCollapseAll={handleCollapseAll}
        onExpandAll={() => handleExpandAll(selectedId, selectedPath)}
        searchResults={searchResults}
        selectedId={selectedId}
        selectedNodeUid={selectedNode?.uid || ""}
        basePath={basePath}
        onSelectItemById={handleSelectItemById}
        onExpandPathToItem={expandPathToItem}
        itemStatuses={itemStatuses}
        lastUpdated={lastUpdated}
        catalogTreeRef={catalogTreeRef}
        filteredTree={filteredTree}
        expandedIds={expandedIds}
        onToggleNode={handleToggleNode}
        onSelectNode={handleSelectItem}
      />
      {isMobileLayout && isSidebarOpen && (
        <button
          type="button"
          className="sidebar-backdrop"
          onClick={() => setIsMobileSidebarOpen(false)}
          aria-label="Close catalog panel"
        />
      )}
      {isMobileLayout && !isSidebarOpen && (
        <div className="sidebar-swipe-hint" aria-hidden="true">
          <span className="sidebar-swipe-hint-edge" />
        </div>
      )}
      <AppLayout
        contentRef={contentRef}
        headerRef={headerRef}
        headerActionsRef={headerActionsRef}
        contentTitlePrimaryRef={contentTitlePrimaryRef}
        isCatalogOpen={isSidebarOpen}
        iconSpriteHref={iconSpriteHref}
        onToggleCatalog={handleToggleSidebar}
        shouldOffsetContentHeader={shouldOffsetContentHeader}
        isTitlePrimaryBelowControls={isTitlePrimaryBelowControls}
        theme={theme}
        isAiChatOpen={effectiveIsAiChatOpen}
        onToggleAiChat={() => setIsAiChatOpen((prev) => !prev)}
        onToggleTheme={() =>
          setTheme((prev) => (prev === "dark" ? "light" : "dark"))
        }
        onOpenAbout={() => setIsAboutOpen(true)}
        selectedItem={selectedItem}
        selectedStatus={selectedStatus}
        lastUpdated={lastUpdated}
        selectedTitleFirstWord={selectedTitleFirstWord}
        selectedTitleRest={selectedTitleRest}
        chat={
          <AiChatPanel
            isOpen={effectiveIsAiChatOpen}
            buildItemLink={buildItemLink}
            onClose={() => setIsAiChatOpen(false)}
            onSelectItem={handleSelectItemByIdNoPath}
          />
        }
      >
        <ItemDetails
          contentRef={contentRef}
          headerRef={headerRef}
          iconSpriteHref={iconSpriteHref}
          theme={theme}
          selectedItem={selectedItem}
          selectedFailingSignals={selectedFailingSignals}
          failingDependencies={failingDependencies}
          selectedItemActors={selectedItemActors}
          actorContactsByActorId={actorContactsByActorId}
          buildItemLink={buildItemLink}
          onOpenSignal={openSignal}
          onSelectItemByPath={handleSelectItemByPath}
          onOpenActor={(actor) => setOpenedActorId(actor.id)}
          passingSignalsCount={passingSignalsCount}
          selectedPassingSignals={selectedPassingSignals}
          onOpenContact={(contact) => setOpenedContact(contact)}
          isTimelineOpen={isTimelineOpen}
          onToggleTimeline={() => setIsTimelineOpen((prev) => !prev)}
          onNavigateToTimelineItem={handleExternalItemLink}
        />
      </AppLayout>
      <HealthSignalModal
        isOpen={Boolean(openedSignalId)}
        signalId={openedSignalId}
        fallbackTitle={openedSignalTitle}
        items={catalog.items}
        buildItemLink={buildItemLink}
        onSelectItemById={handleSelectItemByIdNoPath}
        onClose={closeSignal}
      />
      <AboutModal isOpen={isAboutOpen} onClose={() => setIsAboutOpen(false)} />
      <ContactModal
        isOpen={Boolean(openedContact)}
        contact={openedContact}
        onClose={() => setOpenedContact(null)}
      />
      <ActorModal
        isOpen={Boolean(openedActor)}
        actor={openedActor}
        contacts={openedActorContacts}
        primaryContact={
          openedActor
            ? (actorContactsByActorId.get(openedActor.id)?.primaryContact ??
              null)
            : null
        }
        iconSpriteHref={iconSpriteHref}
        onClose={() => setOpenedActorId("")}
        onOpenContact={(contact) => setOpenedContact(contact)}
      />
    </div>
  );
}
