/**
 * @file Main details panel UI for the selected catalog item.
 */

import TopBarActions from "./TopBarActions";
import AiChatPanel from "./AiChatPanel";
import CatalogItemInfo from "./CatalogItemInfo";
import InfoHelp from "./InfoHelp";
import { isPlainLeftClick } from "../shared/catalogUtils";
import { infoHelpTopics } from "../shared/infoHelpTopics";
import { buildStatusText } from "../shared/statusText";
import {
  resolveContactIconId,
  resolveContactLabel,
  resolveContactTypeClass,
  resolveContactTypeDisplayName,
} from "../shared/contactUtils";
import type {
  CatalogActor,
  CatalogContact,
  CatalogItem,
  FailingDependencyEntry,
  HealthStatus,
  ItemSignal,
} from "../shared/types";
import type {
  KeyboardEvent,
  MouseEvent,
  PointerEvent as ReactPointerEvent,
  ReactElement,
  RefObject,
} from "react";
import { useEffect, useMemo, useRef, useState } from "react";

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
  onOpenFeedback: () => void;
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
  onSelectItemByPath: (pathIds: string[]) => void;
  onOpenActor: (actor: CatalogActor) => void;
  passingSignalsCount: number;
  selectedPassingSignals: ItemSignal[];
  onOpenContact: (contact: CatalogContact) => void;
  isGrafanaOpen: boolean;
  onToggleGrafana: () => void;
  grafanaHeight: number;
  grafanaIframeRef: RefObject<HTMLIFrameElement | null>;
  onGrafanaLoad: () => void;
  grafanaFrameUrl: string;
};

type DetailsDisclosureState = {
  isHealthyOpen: boolean;
  isContactsExtraOpen: boolean;
  isAffectingOpen: boolean;
};

type UnhealthyDependencyRow = {
  id: string;
  title: string;
  signals: ItemSignal[];
  href: string;
  onClick?: (event: MouseEvent<HTMLAnchorElement>) => void;
};

type ExtraActorRow = {
  key: string;
  actor: CatalogActor;
  typeLabel: string;
};

type DisclosurePointerState = {
  startX: number;
  startY: number;
  startSelection: string;
  dragged: boolean;
  suppressClick: boolean;
};

const emptyDisclosureState: DetailsDisclosureState = {
  isHealthyOpen: false,
  isContactsExtraOpen: false,
  isAffectingOpen: true,
};

const buildExtraActorRows = (actors: CatalogActor[]): ExtraActorRow[] =>
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
      typeLabel: String(actor.type || "other").toLowerCase(),
    }));

const renderActorTeamIcon = (iconSpriteHref: string): ReactElement => (
  <span className="actor-team-icon-wrap" aria-hidden="true">
    <svg className="actor-team-icon" viewBox="0 0 24 24" focusable="false">
      <use href={`${iconSpriteHref}#icon-actor`} />
    </svg>
  </span>
);

const renderContactIcon = (
  contact: CatalogContact,
  iconSpriteHref: string,
): ReactElement => {
  const typeDisplayName = resolveContactTypeDisplayName(contact.type);
  return (
    <span
      className="contact-type-icon-wrap"
      title={typeDisplayName}
      aria-label={typeDisplayName}
    >
      <svg
        className={`contact-type-icon ${resolveContactTypeClass(contact.type)}`}
        viewBox="0 0 24 24"
        focusable="false"
        aria-hidden="true"
      >
        <use href={`${iconSpriteHref}#${resolveContactIconId(contact.type)}`} />
      </svg>
    </span>
  );
};

const readSelectedText = () => {
  if (typeof window === "undefined") {
    return "";
  }
  const selection = window.getSelection?.();
  return selection?.toString() || "";
};

const DISCLOSURE_DRAG_THRESHOLD_PX = 5;

const handleDisclosureActionKeyDown = (
  event: KeyboardEvent<HTMLElement>,
  onToggle: () => void,
) => {
  if (event.key !== "Enter" && event.key !== " ") {
    return;
  }
  event.preventDefault();
  onToggle();
};

/**
 * Renders the right-side content area:
 * - selected item title/status
 * - contacts summary
 * - incident-first signals
 * - Grafana iframe container
 */
export default function DetailsPanel({
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
  onOpenFeedback,
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
  onSelectItemByPath,
  onOpenActor,
  passingSignalsCount,
  selectedPassingSignals,
  onOpenContact,
  isGrafanaOpen,
  onToggleGrafana,
  grafanaHeight,
  grafanaIframeRef,
  onGrafanaLoad,
  grafanaFrameUrl,
}: DetailsPanelProps) {
  const selectedStatusText = buildStatusText(selectedStatus, { lastUpdated });
  const selectedItemId = selectedItem?.id || "";
  const [disclosureByItemId, setDisclosureByItemId] = useState<
    Record<string, DetailsDisclosureState>
  >({});
  const disclosurePointerState = useRef<DisclosurePointerState | null>(null);

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

  const handleDisclosurePointerDown = (
    event: ReactPointerEvent<HTMLElement>,
  ) => {
    disclosurePointerState.current = {
      startX: event.clientX,
      startY: event.clientY,
      startSelection: readSelectedText(),
      dragged: false,
      suppressClick: false,
    };
  };

  const handleDisclosurePointerMove = (
    event: ReactPointerEvent<HTMLElement>,
  ) => {
    const pointerState = disclosurePointerState.current;
    if (!pointerState) {
      return;
    }
    const deltaX = event.clientX - pointerState.startX;
    const deltaY = event.clientY - pointerState.startY;
    if (Math.hypot(deltaX, deltaY) > DISCLOSURE_DRAG_THRESHOLD_PX) {
      pointerState.dragged = true;
    }
  };

  const updateDisclosureDragState = (
    pointerState: DisclosurePointerState,
    event: ReactPointerEvent<HTMLElement>,
  ) => {
    const deltaX = event.clientX - pointerState.startX;
    const deltaY = event.clientY - pointerState.startY;
    if (Math.hypot(deltaX, deltaY) > DISCLOSURE_DRAG_THRESHOLD_PX) {
      pointerState.dragged = true;
    }
  };

  const handleDisclosurePointerUp = (event: ReactPointerEvent<HTMLElement>) => {
    const pointerState = disclosurePointerState.current;
    if (!pointerState) {
      return;
    }
    updateDisclosureDragState(pointerState, event);
    const endSelection = readSelectedText();
    pointerState.suppressClick =
      pointerState.dragged || endSelection !== pointerState.startSelection;
  };

  const handleDisclosureClick = (onToggle: () => void) => {
    const pointerState = disclosurePointerState.current;
    disclosurePointerState.current = null;
    if (pointerState?.suppressClick) {
      return;
    }
    onToggle();
  };

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
            onOpenFeedback={onOpenFeedback}
            onOpenAbout={onOpenAbout}
          />
        </div>
        <div className="content-header-main">
          <div className="content-title">
            <span
              className="content-title-primary"
              ref={contentTitlePrimaryRef}
            >
              {selectedItem && (
                <span
                  className={`status-indicator status-${selectedStatus}`}
                  aria-label={selectedStatusText}
                  title={selectedStatusText}
                />
              )}
              <span className="content-title-text content-title-text-first">
                {selectedTitleFirstWord}
              </span>
            </span>
            {selectedTitleRest && (
              <span className="content-title-text content-title-text-rest">
                {selectedTitleRest}
              </span>
            )}
            {selectedItem && selectedStatus !== "up" && (
              <span className={`content-status-label status-${selectedStatus}`}>
                {selectedStatus.toUpperCase()}
              </span>
            )}
            {selectedItem && <CatalogItemInfo item={selectedItem} />}
          </div>
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
                <div
                  className="ownership-summary"
                  role="group"
                  aria-label="Ownership"
                >
                  {primaryContact && (
                    <div className="ownership-contact-section">
                      <div
                        className="primary-contact-block"
                        aria-label="Primary contact"
                      >
                        <div className="primary-contact-heading-row">
                          <div className="primary-contact-heading">
                            Primary contact
                          </div>
                          <InfoHelp topic={infoHelpTopics.primaryContact} />
                        </div>
                        <div className="primary-contact-row">
                          <span className="primary-contact-icon">
                            {renderContactIcon(primaryContact, iconSpriteHref)}
                          </span>
                          <a
                            className="details-text-link primary-contact-link"
                            href={
                              primaryContact.href ||
                              `/contacts/${primaryContact.id}`
                            }
                            onClick={(event) => {
                              if (!isPlainLeftClick(event)) {
                                return;
                              }
                              event.preventDefault();
                              onOpenContact(primaryContact);
                            }}
                            title={resolveContactLabel(primaryContact)}
                          >
                            {resolveContactLabel(primaryContact)}
                          </a>
                        </div>
                      </div>
                    </div>
                  )}

                  {actorRowsForContacts.length > 0 && (
                    <div className="ownership-actors-group">
                      <div className="details-disclosure-header">
                        <span
                          role="button"
                          tabIndex={0}
                          className="details-disclosure-toggle"
                          aria-label="Toggle Actors"
                          aria-expanded={
                            itemDisclosureState.isContactsExtraOpen
                          }
                          onPointerDown={handleDisclosurePointerDown}
                          onPointerMove={handleDisclosurePointerMove}
                          onPointerUp={handleDisclosurePointerUp}
                          onClick={() =>
                            handleDisclosureClick(toggleContactsExtra)
                          }
                          onKeyDown={(event) =>
                            handleDisclosureActionKeyDown(
                              event,
                              toggleContactsExtra,
                            )
                          }
                        >
                          <span
                            className={`details-panel-chevron ${
                              itemDisclosureState.isContactsExtraOpen
                                ? "is-open"
                                : ""
                            }`}
                            aria-hidden="true"
                          >
                            ›
                          </span>
                          <span
                            className="details-disclosure-icon"
                            aria-hidden="true"
                          >
                            {renderActorTeamIcon(iconSpriteHref)}
                          </span>
                          <span className="details-disclosure-label">
                            Actors ({actorRowsForContacts.length})
                          </span>
                        </span>
                        <InfoHelp topic={infoHelpTopics.actors} />
                      </div>
                      <div
                        className={`disclosure-panel ownership-extra-contacts ${
                          itemDisclosureState.isContactsExtraOpen
                            ? "is-open"
                            : ""
                        }`}
                      >
                        <ul className="ownership-extra-list">
                          {actorRowsForContacts.map((entry) => (
                            <li key={entry.key}>
                              <div className="actor-summary-row">
                                <span className="actor-summary-icon">
                                  {renderActorTeamIcon(iconSpriteHref)}
                                </span>
                                <a
                                  className="details-text-link actor-summary-link"
                                  href={`/actors/${entry.actor.id}`}
                                  onClick={(event) => {
                                    if (!isPlainLeftClick(event)) {
                                      return;
                                    }
                                    event.preventDefault();
                                    onOpenActor(entry.actor);
                                  }}
                                  title={entry.actor.title || entry.actor.id}
                                >
                                  {entry.actor.title || entry.actor.id}
                                </a>
                                <span className="details-row-meta details-row-meta-capitalize">
                                  ({entry.typeLabel})
                                </span>
                              </div>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  )}
                </div>

                {hasAffectingSignals && (
                  <div className="details-disclosure-section">
                    <div className="details-disclosure-header">
                      <span
                        role="button"
                        tabIndex={0}
                        className="details-disclosure-toggle"
                        aria-label="Toggle Unhealthy signals"
                        aria-expanded={itemDisclosureState.isAffectingOpen}
                        onPointerDown={handleDisclosurePointerDown}
                        onPointerMove={handleDisclosurePointerMove}
                        onPointerUp={handleDisclosurePointerUp}
                        onClick={() =>
                          handleDisclosureClick(toggleAffectingSignals)
                        }
                        onKeyDown={(event) =>
                          handleDisclosureActionKeyDown(
                            event,
                            toggleAffectingSignals,
                          )
                        }
                      >
                        <span
                          className={`details-panel-chevron ${
                            itemDisclosureState.isAffectingOpen ? "is-open" : ""
                          }`}
                          aria-hidden="true"
                        >
                          ›
                        </span>
                        <span
                          className="status-indicator status-down details-disclosure-status"
                          aria-hidden="true"
                        />
                        <span className="details-disclosure-label">
                          Unhealthy signals ({affectingCount})
                        </span>
                      </span>
                      <InfoHelp topic={infoHelpTopics.unhealthySignals} />
                    </div>
                    <div
                      className={`disclosure-panel ${
                        itemDisclosureState.isAffectingOpen ? "is-open" : ""
                      }`}
                    >
                      <ul className="details-unhealthy-list">
                        {selectedFailingSignals.map((entry) => (
                          <li
                            key={entry.id}
                            className="signals-unhealthy-own-row"
                            aria-label={`${entry.title || entry.id}, ${buildStatusText(entry.status)}`}
                          >
                            <div className="signal-row signal-status-row">
                              <span
                                className="signal-name"
                                title={entry.title || entry.id}
                              >
                                {entry.title || entry.id}
                              </span>
                              {entry.status === "unknown" && (
                                <span className="signal-unknown-label">
                                  UNKNOWN
                                </span>
                              )}
                            </div>
                          </li>
                        ))}

                        {unhealthyDependencyRows.map((row) => (
                          <li key={row.id} className="signals-incident-row">
                            <div className="signals-dependency-row">
                              <a
                                className="details-text-link"
                                title={row.title}
                                href={row.href}
                                onClick={row.onClick}
                              >
                                {row.title}
                              </a>
                            </div>
                            <ul className="signals-incident-signal-list">
                              {row.signals.map((signal) => (
                                <li
                                  key={signal.id}
                                  className="signals-incident-signal"
                                  title={signal.title || signal.id}
                                  aria-label={`${signal.title || signal.id}, ${buildStatusText(signal.status)}`}
                                >
                                  <span className="signal-name">
                                    {signal.title || signal.id}
                                  </span>
                                  {signal.status === "unknown" && (
                                    <span className="signal-unknown-label">
                                      UNKNOWN
                                    </span>
                                  )}
                                </li>
                              ))}
                            </ul>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                )}

                {passingSignalsCount > 0 && (
                  <div className="details-disclosure-section">
                    <div className="details-disclosure-header">
                      <span
                        role="button"
                        tabIndex={0}
                        className="details-disclosure-toggle"
                        aria-label="Toggle Healthy signals"
                        aria-expanded={itemDisclosureState.isHealthyOpen}
                        onPointerDown={handleDisclosurePointerDown}
                        onPointerMove={handleDisclosurePointerMove}
                        onPointerUp={handleDisclosurePointerUp}
                        onClick={() =>
                          handleDisclosureClick(toggleHealthySignals)
                        }
                        onKeyDown={(event) =>
                          handleDisclosureActionKeyDown(
                            event,
                            toggleHealthySignals,
                          )
                        }
                      >
                        <span
                          className={`details-panel-chevron ${
                            itemDisclosureState.isHealthyOpen ? "is-open" : ""
                          }`}
                          aria-hidden="true"
                        >
                          ›
                        </span>
                        <span
                          className="status-indicator status-up details-disclosure-status"
                          aria-hidden="true"
                        />
                        <span className="details-disclosure-label">
                          Healthy signals ({passingSignalsCount})
                        </span>
                      </span>
                      <InfoHelp topic={infoHelpTopics.healthySignals} />
                    </div>
                    <div
                      className={`disclosure-panel ${
                        itemDisclosureState.isHealthyOpen ? "is-open" : ""
                      }`}
                    >
                      <ul className="signals-healthy-list">
                        {selectedPassingSignals.map((entry) => (
                          <li key={entry.id} className="signals-healthy-row">
                            <div className="signal-row signal-status-row">
                              <span
                                className={`status-indicator status-${entry.status}`}
                                aria-label={buildStatusText(entry.status)}
                                title={buildStatusText(entry.status)}
                              />
                              <span
                                className="signal-name"
                                title={entry.title || entry.id}
                              >
                                {entry.title || entry.id}
                              </span>
                            </div>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                )}
              </section>

              <section className="details-disclosure-section details-timeline-section">
                <div className="details-disclosure-header">
                  <span
                    role="button"
                    tabIndex={0}
                    className="details-disclosure-toggle"
                    aria-label="Toggle Timeline"
                    aria-expanded={isGrafanaOpen}
                    onPointerDown={handleDisclosurePointerDown}
                    onPointerMove={handleDisclosurePointerMove}
                    onPointerUp={handleDisclosurePointerUp}
                    onClick={() => handleDisclosureClick(onToggleGrafana)}
                    onKeyDown={(event) =>
                      handleDisclosureActionKeyDown(event, onToggleGrafana)
                    }
                  >
                    <span
                      className={`details-panel-chevron ${isGrafanaOpen ? "is-open" : ""}`}
                      aria-hidden="true"
                    >
                      ›
                    </span>
                    <span
                      className="details-disclosure-icon details-disclosure-symbol"
                      aria-hidden="true"
                    >
                      ◷
                    </span>
                    <span className="details-disclosure-label">Timeline</span>
                  </span>
                  <InfoHelp topic={infoHelpTopics.timeline} />
                </div>
                {isGrafanaOpen && (
                  <div className="details-timeline-body">
                    <div className="grafana-grid">
                      <section
                        className="grafana-panel"
                        style={
                          grafanaHeight
                            ? { height: `${grafanaHeight}px` }
                            : undefined
                        }
                      >
                        <iframe
                          title="State Timeline"
                          ref={grafanaIframeRef}
                          onLoad={onGrafanaLoad}
                          src={grafanaFrameUrl}
                        />
                      </section>
                    </div>
                  </div>
                )}
              </section>
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
