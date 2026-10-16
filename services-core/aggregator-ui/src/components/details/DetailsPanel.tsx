/**
 * @file Main details panel UI for the selected catalog item.
 */

import TopBarActions from "./top-bar/TopBarActions";
import AiChatPanel from "./ai-chat/AiChatPanel";
import ItemTitle from "../shared/item/ItemTitle";
import ItemOwnership, { type ActorSummaryRow } from "../shared/item/ItemOwnership";
import { HealthySignals, UnhealthySignals, type UnhealthyDependencyRow } from "../shared/item/ItemSignals";
import TimelineSection from "../item-details/timeline/TimelineSection";
import InfoHelp from "../shared/help/InfoHelp";
import { isPlainLeftClick } from "../../shared/ui/pointerUtils";
import type {
  CatalogActor,
  CatalogContact,
  CatalogItem,
  FailingDependencyEntry,
  HealthStatus,
  ItemSignal,
} from "../../shared/types";
import type {
  MouseEvent,
  RefObject,
} from "react";
import { useEffect, useMemo, useState } from "react";

type DetailsPanelProps = {
  contentRef: RefObject<HTMLElement | null>;
  isSidebarOpen: boolean;
  iconSpriteHref: string;
  onToggleSidebar: () => void;
  shouldOffsetContentHeader: boolean;
  isTitlePrimaryBelowControls: boolean;
  headerRef: RefObject<HTMLElement | null>;
  headerActionsRef: RefObject<HTMLDivElement | null>;
  theme: "dark" | "light";
  isAiChatOpen: boolean;
  onCloseAiChat: () => void;
  onToggleAiChat: () => void;
  onToggleTheme: () => void;
  onOpenAbout: () => void;
  selectedItem: CatalogItem | undefined;
  selectedStatus: HealthStatus;
  lastUpdated: string;
  selectedTitleFirstWord: string;
  selectedTitleRest: string;
  contentTitlePrimaryRef: RefObject<HTMLElement | null>;
  selectedFailingSignals: ItemSignal[];
  failingDependencies: FailingDependencyEntry[];
  selectedItemActors: {
    owner: CatalogActor | null;
    otherActors: CatalogActor[];
  } | null;
  actorContactsByActorId: Map<
    string,
    { contacts: CatalogContact[]; primaryContact: CatalogContact | null }
  >;
  buildItemLink: (itemId: string, pathIds?: string[]) => string;
  onSelectItemById: (itemId: string) => void;
  onOpenSignal: (signal: ItemSignal) => void;
  onSelectItemByPath: (pathIds: string[]) => void;
  onOpenActor: (actor: CatalogActor) => void;
  passingSignalsCount: number;
  selectedPassingSignals: ItemSignal[];
  onOpenContact: (contact: CatalogContact) => void;
  isTimelineOpen: boolean;
  onToggleTimeline: () => void;
  onNavigateToTimelineItem: (itemId: string, href: string) => void;
};

const buildSignalLink = (id: string): string =>
  `#signal/${encodeURIComponent(id)}`;

type DetailsDisclosureState = {
  isHealthyOpen: boolean;
  isContactsExtraOpen: boolean;
  isAffectingOpen: boolean;
};

const emptyDisclosureState: DetailsDisclosureState = {
  isHealthyOpen: false,
  isContactsExtraOpen: false,
  isAffectingOpen: true,
};

const buildExtraActorRows = (actors: CatalogActor[]): ActorSummaryRow[] =>
  [...actors]
    .sort((left, right) => {
      const rankByType: Record<string, number> = {
        owner: 0,
        user: 1,
        other: 2,
      };
      const leftRank = rankByType[String(left.type || "other")] ?? 99;
      const rightRank = rankByType[String(right.type || "other")] ?? 99;
      const typeCompare = leftRank - rightRank;
      if (typeCompare !== 0) {
        return typeCompare;
      }
      return (left.title || left.id).localeCompare(right.title || right.id);
    })
    .map((actor) => ({
      key: actor.id,
      actor,
      typeLabel: String(actor.type || "other")
        .toLowerCase()
        .replace(/^./, (firstLetter) => firstLetter.toUpperCase()),
    }));

/**
 * Renders the right-side content area:
 * - selected item title/status
 * - contacts summary
 * - incident-first signals
 * - Grafana iframe container
 */
function DetailsPanelContent({
  contentRef,
  isSidebarOpen,
  iconSpriteHref,
  onToggleSidebar,
  shouldOffsetContentHeader,
  isTitlePrimaryBelowControls,
  headerRef,
  headerActionsRef,
  theme,
  isAiChatOpen,
  onCloseAiChat,
  onToggleAiChat,
  onToggleTheme,
  onOpenAbout,
  selectedItem,
  selectedStatus,
  lastUpdated,
  selectedTitleFirstWord,
  selectedTitleRest,
  contentTitlePrimaryRef,
  selectedFailingSignals,
  failingDependencies,
  selectedItemActors,
  actorContactsByActorId,
  buildItemLink,
  onSelectItemById,
  onOpenSignal,
  onSelectItemByPath,
  onOpenActor,
  passingSignalsCount,
  selectedPassingSignals,
  onOpenContact,
  isTimelineOpen,
  onToggleTimeline,
  onNavigateToTimelineItem,
}: DetailsPanelProps) {
  const selectedItemId = selectedItem?.id || "";
  const [disclosureByItemId, setDisclosureByItemId] = useState<
    Record<string, DetailsDisclosureState>
  >({});

  const handleSignalClick = (
    event: MouseEvent<HTMLAnchorElement>,
    signal: ItemSignal,
  ) => {
    if (!isPlainLeftClick(event)) {
      return;
    }
    event.preventDefault();
    onOpenSignal(signal);
  };

  const ownerActorForContacts =
    selectedItemActors?.owner || selectedItemActors?.otherActors?.[0] || null;
  const ownerContactsEntry = ownerActorForContacts
    ? actorContactsByActorId.get(ownerActorForContacts.id) || null
    : null;
  const primaryContact =
    ownerContactsEntry?.primaryContact ||
    ownerContactsEntry?.contacts[0] ||
    null;
  const actorsForContacts = selectedItemActors
    ? selectedItemActors.owner
      ? [selectedItemActors.owner, ...selectedItemActors.otherActors]
      : selectedItemActors.otherActors
    : [];
  const actorRowsForContacts = useMemo(
    () => buildExtraActorRows(actorsForContacts),
    [actorsForContacts],
  );

  const unhealthyDependencyRows = useMemo<UnhealthyDependencyRow[]>(
    () =>
      failingDependencies.map((entry) => ({
        id: `dep:${entry.id}`,
        title: entry.name,
        signals: entry.failingSignals,
        href: buildItemLink(entry.id, entry.path),
        onClick: (event) => {
          if (!isPlainLeftClick(event)) {
            return;
          }
          event.preventDefault();
          onSelectItemByPath(entry.path);
        },
      })),
    [buildItemLink, failingDependencies, onSelectItemByPath],
  );

  const affectingCount =
    selectedFailingSignals.length +
    unhealthyDependencyRows.reduce(
      (total, row) => total + row.signals.length,
      0,
    );
  const hasAffectingSignals = affectingCount > 0;

  useEffect(() => {
    if (!selectedItemId) {
      return;
    }
    setDisclosureByItemId((prev) => {
      if (prev[selectedItemId]) {
        return prev;
      }
      return {
        ...prev,
        [selectedItemId]: {
          ...emptyDisclosureState,
        },
      };
    });
  }, [selectedItemId]);

  const itemDisclosureState = selectedItemId
    ? disclosureByItemId[selectedItemId] || {
        ...emptyDisclosureState,
      }
    : { ...emptyDisclosureState };

  const updateDisclosureState = (patch: Partial<DetailsDisclosureState>) => {
    if (!selectedItemId) {
      return;
    }
    setDisclosureByItemId((prev) => {
      const current = prev[selectedItemId] || {
        ...emptyDisclosureState,
      };
      return {
        ...prev,
        [selectedItemId]: {
          ...current,
          ...patch,
        },
      };
    });
  };

  const toggleContactsExtra = () =>
    updateDisclosureState({
      isContactsExtraOpen: !itemDisclosureState.isContactsExtraOpen,
    });
  const toggleAffectingSignals = () =>
    updateDisclosureState({
      isAffectingOpen: !itemDisclosureState.isAffectingOpen,
    });
  const toggleHealthySignals = () =>
    updateDisclosureState({
      isHealthyOpen: !itemDisclosureState.isHealthyOpen,
    });

  return (
    <main className="content" ref={contentRef}>
      {!isSidebarOpen && (
        <button
          type="button"
          aria-label="Open catalog panel"
          className={[
            "hamburger-toggle",
            "sidebar-toggle",
            "top-control",
            "top-control-button",
            "top-control-icon",
            "top-control-surface",
          ].join(" ")}
          onClick={onToggleSidebar}
        >
          <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
            <use href={`${iconSpriteHref}#icon-menu`} />
          </svg>
        </button>
      )}
      <header
        className={`content-header ${
          shouldOffsetContentHeader ? "content-header-with-toggle" : ""
        } ${isTitlePrimaryBelowControls ? "content-header-primary-below-controls" : ""}`}
        ref={headerRef}
      >
        <div className="content-header-actions" ref={headerActionsRef}>
          <TopBarActions
            theme={theme}
            isAiChatOpen={isAiChatOpen}
            onToggleAiChat={onToggleAiChat}
            onToggleTheme={onToggleTheme}
            onOpenAbout={onOpenAbout}
          />
        </div>
        <div className="content-header-main">
          <ItemTitle item={selectedItem} status={selectedStatus} lastUpdated={lastUpdated}
            firstWord={selectedTitleFirstWord} rest={selectedTitleRest}
            primaryRef={contentTitlePrimaryRef} />
        </div>
      </header>
      <div
        className={`content-workspace ${isAiChatOpen ? "ai-chat-open" : ""}`}
      >
        <div className="item-details-column">
          {!selectedItem ? (
            <div className="empty">
              Select a catalog item to view dashboards.
            </div>
          ) : (
            <>
              <section className="details-summary-block">
                <ItemOwnership primaryContact={primaryContact} actorRows={actorRowsForContacts}
                  expanded={itemDisclosureState.isContactsExtraOpen} onToggleActors={toggleContactsExtra}
                  onOpenContact={onOpenContact} onOpenActor={onOpenActor} iconSpriteHref={iconSpriteHref}
                  primaryHelp={<InfoHelp topicId="primary-contact" />}
                  actorsHelp={<InfoHelp topicId="actors" />} />
                {hasAffectingSignals && (
                  <UnhealthySignals signals={selectedFailingSignals} dependencies={unhealthyDependencyRows}
                    expanded={itemDisclosureState.isAffectingOpen} onToggle={toggleAffectingSignals}
                    buildSignalLink={buildSignalLink} onSignalClick={handleSignalClick}
                    help={<InfoHelp topicId="unhealthy-signals" />} />
                )}
                {passingSignalsCount > 0 && (
                  <HealthySignals signals={selectedPassingSignals} count={passingSignalsCount}
                    expanded={itemDisclosureState.isHealthyOpen} onToggle={toggleHealthySignals}
                    buildSignalLink={buildSignalLink} onSignalClick={handleSignalClick}
                    help={<InfoHelp topicId="healthy-signals" />} />
                )}
              </section>

              <TimelineSection
                itemId={selectedItem.id}
                theme={theme}
                expanded={isTimelineOpen}
                onToggle={onToggleTimeline}
                onNavigateToItem={onNavigateToTimelineItem}
                contentRef={contentRef}
                headerRef={headerRef}
              />
            </>
          )}
        </div>
        <AiChatPanel
          isOpen={isAiChatOpen}
          buildItemLink={buildItemLink}
          onClose={onCloseAiChat}
          onSelectItem={onSelectItemById}
        />
      </div>
    </main>
  );
}

export default function DetailsPanel(props: DetailsPanelProps) {
  return <DetailsPanelContent {...props} />;
}
