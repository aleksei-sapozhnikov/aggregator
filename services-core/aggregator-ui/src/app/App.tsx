/**
 * @file Main React application orchestrator for aggregator-ui.
 */

import { useEffect, useMemo, useRef, useState } from "react";
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
import useCatalogData from "./hooks/useCatalogData";
import useResponsiveLayout from "./hooks/useResponsiveLayout";
import useTitlePlacement from "./hooks/useTitlePlacement";
import useCatalogNavigation from "../components/catalog-tree/useCatalogNavigation";
import useCatalogSelectionSync from "../components/catalog-tree/useCatalogSelectionSync";
import { getInitialTheme, resolveBasePath, resolveCatalogTitle } from "../services/aggregatorApi";
import type { CatalogContact } from "../shared/types";

const TEMP_AI_CHAT_STORAGE_KEY = "aggregator-ui-ai-chat-enabled";

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
 * Coordinates feature hooks (routing, catalog, presentation, responsive layout)
 * and wires large UI blocks (CatalogTree, AppLayout, ItemDetails, AboutModal).
 */
export default function App() {
  const catalogTitle = resolveCatalogTitle();
  const isAiChatFeatureEnabled = useMemo(isTemporaryAiChatEnabled, []);
  const [theme, setTheme] = useState(getInitialTheme);
  const { catalog, error, itemStatuses, itemSignals } = useCatalogData();


  const [isTimelineOpen, setIsTimelineOpen] = useState(true);
  const [isAiChatOpen, setIsAiChatOpen] = useState(false);
  const [isAboutOpen, setIsAboutOpen] = useState(false);
  const { openedSignalId, openedSignalTitle, openSignal, closeSignal } =
    useSignalDetails();
  const [openedContact, setOpenedContact] = useState<CatalogContact | null>(
    null,
  );
  const [openedActorId, setOpenedActorId] = useState("");
  const contentRef = useRef<HTMLElement | null>(null);

  const {
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
  } = useResponsiveLayout();

  const basePath = useMemo(resolveBasePath, []);
  const effectiveIsAiChatOpen = isAiChatFeatureEnabled && isAiChatOpen;

  useEffect(() => {
    document.body.dataset.theme = theme;
    localStorage.setItem("aggregator-ui-theme", theme);
  }, [theme]);

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
    filteredTree,
    searchResults,
    isSearchAutocompleteReady,
    searchAutocompleteOptions,
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

  useEffect(() => {
    if (catalog.items.length) {
      initializeSelectedId((prev) => prev || catalog.items[0]?.id || "");
    }
  }, [catalog.items, initializeSelectedId]);

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

  const homeHref = basePath || "/";
  const homeIconSrc = `${basePath || "/"}logo.svg`;
  const iconSpriteHref = `${basePath || "/"}icons.svg`;
  const searchSuggestionsListId = "item-search-suggestions";

  const {
    isTitlePrimaryBelowControls,
    headerRef,
    headerActionsRef,
    contentTitlePrimaryRef,
  } = useTitlePlacement({
    isMobileLayout,
    isMobileSidebarOpen,
    isDesktopSidebarOpen,
    selectedId,
    selectedTitleFirstWord,
  });

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
