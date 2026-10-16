/**
 * @file Main React application orchestrator for aggregator-ui.
 */

import type { TouchEvent } from "react";
import {
  fetchProductHealth,
  getInitialTheme,
  loadCatalog,
  resolveBasePath,
  resolveCatalogTitle,
} from "../services/aggregatorApi";
import { sortContactsWithPrimaryFirst } from "../shared/contacts/contactPresentation";
import {
  compareHealthStatus,
  isUnhealthyHealthStatus,
} from "../shared/health/healthPresentation";
import type {
  CatalogActor,
  CatalogActorContact,
  CatalogContact,
  CatalogDependency,
  CatalogItem,
  CatalogItemActor,
  CatalogItemContact,
  CatalogTreeNode,
  FailingDependencyEntry,
  HealthStatus,
  ItemSignal,
  ProductHealthItem,
} from "../shared/types";

const MOBILE_BREAKPOINT = 900;
const MOBILE_SWIPE_OPEN_DISTANCE_PX = 96;
const MOBILE_SWIPE_CLOSE_DISTANCE_PX = 96;
const MOBILE_SWIPE_MAX_VERTICAL_DRIFT_PX = 48;
const TEMP_AI_CHAT_STORAGE_KEY = "aggregator-ui-ai-chat-enabled";
type ItemActorsEntry = {
  owner: CatalogActor | null;
  otherActors: CatalogActor[];
};

const compareSignalsByStatusAndTitle = (
  left: ItemSignal,
  right: ItemSignal,
): number => {
  const statusCompare = compareHealthStatus(left.status, right.status);
  if (statusCompare !== 0) {
    return statusCompare;
  }
  return (
    (left.title || left.id).localeCompare(right.title || right.id) ||
    left.id.localeCompare(right.id)
  );
};

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

  const selectedItem = selectedNode?.item || itemMap.get(selectedId);
  const selectedStatus = selectedItem
    ? itemStatuses[selectedItem.id] || "unknown"
    : "unknown";
  const selectedTitleText = selectedItem
    ? selectedItem.title || selectedItem.id
    : "Select an item";
  const selectedTitleMatch = selectedTitleText.match(/^(\S+)([\s\S]*)$/);
  const selectedTitleFirstWord = selectedTitleMatch?.[1] || selectedTitleText;
  const selectedTitleRest = selectedTitleMatch?.[2] || "";

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
  const selectedSignals = useMemo(() => {
    if (!selectedItem) {
      return [];
    }
    const signals = itemSignals[selectedItem.id] || [];
    return [...signals].sort(compareSignalsByStatusAndTitle);
  }, [itemSignals, selectedItem]);

  const selectedFailingSignals = useMemo(
    () =>
      selectedSignals.filter((signal) =>
        isUnhealthyHealthStatus(signal.status),
      ),
    [selectedSignals],
  );
  const selectedPassingSignals = useMemo(
    () => selectedSignals.filter((signal) => signal.status === "up"),
    [selectedSignals],
  );
  const contactsById = useMemo(
    () => new Map(catalog.contacts.map((contact) => [contact.id, contact])),
    [catalog.contacts],
  );
  const actorsById = useMemo(
    () => new Map(catalog.actors.map((actor) => [actor.id, actor])),
    [catalog.actors],
  );
  const actorContactsByActorId = useMemo(() => {
    const grouped = new Map<
      string,
      { contacts: Map<string, CatalogContact>; primaryContactId: string }
    >();
    catalog.actorContacts.forEach((entry) => {
      const contact = contactsById.get(entry.contactId);
      if (!contact) {
        return;
      }
      if (!grouped.has(entry.actorId)) {
        grouped.set(entry.actorId, {
          contacts: new Map<string, CatalogContact>(),
          primaryContactId: "",
        });
      }
      const actorContacts = grouped.get(entry.actorId);
      if (!actorContacts) {
        return;
      }
      actorContacts.contacts.set(contact.id, contact);
      if (entry.isPrimary && !actorContacts.primaryContactId) {
        actorContacts.primaryContactId = contact.id;
      }
    });
    const result = new Map<
      string,
      { contacts: CatalogContact[]; primaryContact: CatalogContact | null }
    >();
    grouped.forEach((value, actorId) => {
      const sortedContacts = sortContactsWithPrimaryFirst(
        [...value.contacts.values()],
        value.primaryContactId,
      );
      const primaryContact = value.primaryContactId
        ? sortedContacts.find(
            (contact) => contact.id === value.primaryContactId,
          ) ||
          sortedContacts[0] ||
          null
        : sortedContacts[0] || null;
      result.set(actorId, { contacts: sortedContacts, primaryContact });
    });
    return result;
  }, [catalog.actorContacts, contactsById]);
  const actorsByItemId = useMemo(() => {
    const grouped = new Map<string, CatalogItemActor[]>();
    catalog.itemActors.forEach((entry) => {
      if (!grouped.has(entry.itemId)) {
        grouped.set(entry.itemId, []);
      }
      grouped.get(entry.itemId)?.push(entry);
    });
    const result = new Map<string, ItemActorsEntry>();
    grouped.forEach((relations, itemId) => {
      const actorMap = new Map<string, CatalogActor>();
      relations.forEach((relation) => {
        const actor = actorsById.get(relation.actorId);
        if (actor) {
          actorMap.set(actor.id, actor);
        }
      });
      const resolvedActors = [...actorMap.values()];
      if (resolvedActors.length === 0) {
        return;
      }
      const typedOwner =
        resolvedActors.find((actor) => actor.type === "owner") || null;
      const primaryRelation = relations.find((relation) => relation.isPrimary);
      const relationPrimary = primaryRelation
        ? actorsById.get(primaryRelation.actorId) || null
        : null;
      const owner = typedOwner || relationPrimary || null;
      result.set(itemId, {
        owner,
        otherActors: resolvedActors.filter((actor) => actor.id !== owner?.id),
      });
    });
    return result;
  }, [actorsById, catalog.itemActors]);
  const selectedItemActors = useMemo(
    () => (selectedItem ? actorsByItemId.get(selectedItem.id) || null : null),
    [actorsByItemId, selectedItem],
  );
  const failingDependencies = useMemo(() => {
    if (!selectedNode) {
      return [];
    }

    const result: FailingDependencyEntry[] = [];
    const displayedItemIds = new Set<string>();

    const visit = (children: CatalogTreeNode[]) => {
      children.forEach((node) => {
        const failingSignals = (itemSignals[node.item.id] || [])
          .filter((signal) => isUnhealthyHealthStatus(signal.status))
          .sort(compareSignalsByStatusAndTitle);

        if (failingSignals.length > 0 && !displayedItemIds.has(node.item.id)) {
          displayedItemIds.add(node.item.id);
          result.push({
            id: node.item.id,
            name: node.item.title || node.item.id,
            path: node.path || [node.item.id],
            status: failingSignals[0]?.status || "unknown",
            failingSignals,
            failingCountContribution: 1,
          });
        }

        visit(node.children);
      });
    };

    visit(selectedNode.children);

    return result.sort(
      (left, right) =>
        left.path.length - right.path.length ||
        left.name.localeCompare(right.name) ||
        left.id.localeCompare(right.id),
    );
  }, [itemSignals, selectedNode]);
  const openedActor = useMemo(
    () => (openedActorId ? actorsById.get(openedActorId) || null : null),
    [actorsById, openedActorId],
  );
  const openedActorContacts = useMemo(
    () =>
      openedActor
        ? actorContactsByActorId.get(openedActor.id)?.contacts || []
        : [],
    [actorContactsByActorId, openedActor],
  );
  const passingSignalsCount = selectedPassingSignals.length;
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
