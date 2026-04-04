/**
 * @file Main details panel UI for the selected catalog item.
 */

import TopBarActions from "./TopBarActions";
import { isPlainLeftClick } from "../shared/catalogUtils";
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
import type { MouseEvent, MutableRefObject } from "react";
import { useEffect, useMemo, useState } from "react";

const AFFECTING_PREVIEW_LIMIT = 3;

type DetailsPanelProps = {
  contentRef: MutableRefObject<HTMLElement | null>;
  isSidebarOpen: boolean;
  iconSpriteHref: string;
  onToggleSidebar: () => void;
  shouldOffsetContentHeader: boolean;
  isTitlePrimaryBelowControls: boolean;
  headerRef: MutableRefObject<HTMLElement | null>;
  headerActionsRef: MutableRefObject<HTMLDivElement | null>;
  theme: "dark" | "light";
  onToggleTheme: () => void;
  onOpenFeedback: () => void;
  onOpenAbout: () => void;
  selectedItem: CatalogItem | undefined;
  selectedStatus: HealthStatus;
  lastUpdated: string;
  selectedTitleFirstWord: string;
  selectedTitleRest: string;
  contentTitlePrimaryRef: MutableRefObject<HTMLElement | null>;
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
  onSelectItemByPath: (pathIds: string[]) => void;
  onOpenActor: (actor: CatalogActor) => void;
  passingSignalsCount: number;
  selectedPassingSignals: ItemSignal[];
  hasOwnHealthSignals: boolean;
  onOpenContact: (contact: CatalogContact) => void;
  isGrafanaOpen: boolean;
  onToggleGrafana: () => void;
  grafanaHeight: number;
  grafanaIframeRef: MutableRefObject<HTMLIFrameElement | null>;
  onGrafanaLoad: () => void;
  grafanaFrameUrl: string;
};

type DetailsDisclosureState = {
  isHealthyOpen: boolean;
  isContactsExtraOpen: boolean;
  showAllAffecting: boolean;
};

type AffectingSignalRow = {
  id: string;
  typeLabel: "Own" | "Dependency";
  title: string;
  signals?: string[];
  status: HealthStatus;
  href?: string;
  onClick?: (event: MouseEvent<HTMLAnchorElement>) => void;
};

type ExtraActorRow = {
  key: string;
  actor: CatalogActor;
  typeLabel: string;
};

const emptyDisclosureState: DetailsDisclosureState = {
  isHealthyOpen: false,
  isContactsExtraOpen: false,
  showAllAffecting: false,
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

const renderContactTypeIcon = (
  iconSpriteHref: string,
  contactType: string,
): JSX.Element => (
  <span
    className="contact-type-icon-wrap"
    title={resolveContactTypeDisplayName(contactType)}
    aria-label={resolveContactTypeDisplayName(contactType)}
  >
    <svg
      className={`contact-type-icon ${resolveContactTypeClass(contactType)}`}
      viewBox="0 0 24 24"
      focusable="false"
      aria-hidden="true"
    >
      <use href={`${iconSpriteHref}#${resolveContactIconId(contactType)}`} />
    </svg>
  </span>
);

const renderActorTeamIcon = (iconSpriteHref: string): JSX.Element => (
  <span className="actor-team-icon-wrap" aria-hidden="true">
    <svg className="actor-team-icon" viewBox="0 0 24 24" focusable="false">
      <use href={`${iconSpriteHref}#icon-actor`} />
    </svg>
  </span>
);

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
  onSelectItemByPath,
  onOpenActor,
  passingSignalsCount,
  selectedPassingSignals,
  hasOwnHealthSignals,
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

  const ownerActorForContacts =
    selectedItemActors?.owner || selectedItemActors?.otherActors?.[0] || null;
  const ownerContactsEntry = ownerActorForContacts
    ? actorContactsByActorId.get(ownerActorForContacts.id) || null
    : null;
  const primaryContact =
    ownerContactsEntry?.primaryContact ||
    ownerContactsEntry?.contacts[0] ||
    null;
  const otherActorsForContacts = selectedItemActors
    ? selectedItemActors.owner
      ? selectedItemActors.otherActors
      : selectedItemActors.otherActors.slice(1)
    : [];
  const extraActorRows = useMemo(
    () => buildExtraActorRows(otherActorsForContacts),
    [otherActorsForContacts],
  );

  const affectingRows = useMemo<AffectingSignalRow[]>(() => {
    const ownRows: AffectingSignalRow[] =
      selectedFailingSignals.length > 0
        ? [
            {
              id: "own:signals",
              typeLabel: "Own",
              title: "",
              signals: selectedFailingSignals.map(
                (signal) => signal.title || signal.id,
              ),
              status: selectedFailingSignals[0]?.status || "down",
            },
          ]
        : [];

    const dependencyRows: AffectingSignalRow[] = failingDependencies.map(
      (entry) => {
        return {
          id: `dep:${entry.id}`,
          typeLabel: "Dependency",
          title: entry.name,
          signals: entry.failingSignals.map(
            (signal) => signal.title || signal.id,
          ),
          status: entry.status,
          href: buildItemLink(entry.id, entry.path),
          onClick: (event) => {
            if (!isPlainLeftClick(event)) {
              return;
            }
            event.preventDefault();
            onSelectItemByPath(entry.path);
          },
        };
      },
    );

    return [...ownRows, ...dependencyRows].sort((left, right) => {
      const rank = (row: AffectingSignalRow) =>
        row.typeLabel === "Own" ? 0 : 1;
      const typeCompare = rank(left) - rank(right);
      if (typeCompare !== 0) {
        return typeCompare;
      }
      return left.title.localeCompare(right.title);
    });
  }, [
    buildItemLink,
    failingDependencies,
    onSelectItemByPath,
    selectedFailingSignals,
  ]);

  const hasAffectingSignals = affectingRows.length > 0;

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

  const visibleAffectingRows =
    itemDisclosureState.showAllAffecting ||
    affectingRows.length <= AFFECTING_PREVIEW_LIMIT
      ? affectingRows
      : affectingRows.slice(0, AFFECTING_PREVIEW_LIMIT);

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
          </div>
        </div>
      </header>
      {!selectedItem ? (
        <div className="empty">Select a catalog item to view dashboards.</div>
      ) : (
        <>
          <section className="details-inline-block">
            <div
              className="ownership-summary"
              role="group"
              aria-label="Ownership"
            >
              <p className="ownership-label">Owner</p>
              {ownerActorForContacts ? (
                <a
                  className="ownership-owner-value"
                  href={`/actors/${ownerActorForContacts.id}`}
                  onClick={(event) => {
                    if (!isPlainLeftClick(event)) {
                      return;
                    }
                    event.preventDefault();
                    onOpenActor(ownerActorForContacts);
                  }}
                  title={
                    ownerActorForContacts.title || ownerActorForContacts.id
                  }
                >
                  {renderActorTeamIcon(iconSpriteHref)}
                  {ownerActorForContacts.title || ownerActorForContacts.id}
                </a>
              ) : (
                <p className="ownership-empty">No owner linked to this item</p>
              )}

              {primaryContact && (
                <div className="ownership-contact-section">
                  <p className="ownership-label">Primary contact</p>
                  <a
                    className="ownership-contact-row"
                    href={
                      primaryContact.href || `/contacts/${primaryContact.id}`
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
                    {renderContactTypeIcon(iconSpriteHref, primaryContact.type)}
                    <span className="ownership-contact-value">
                      {resolveContactLabel(primaryContact)}
                    </span>
                  </a>
                </div>
              )}

              {extraActorRows.length > 0 && (
                <>
                  <button
                    type="button"
                    className="ownership-expand-button"
                    onClick={() =>
                      updateDisclosureState({
                        isContactsExtraOpen:
                          !itemDisclosureState.isContactsExtraOpen,
                      })
                    }
                    aria-expanded={itemDisclosureState.isContactsExtraOpen}
                  >
                    <span
                      className={`details-panel-chevron ${
                        itemDisclosureState.isContactsExtraOpen ? "is-open" : ""
                      }`}
                      aria-hidden="true"
                    >
                      ›
                    </span>
                    {itemDisclosureState.isContactsExtraOpen
                      ? "Hide more actors"
                      : `Show ${extraActorRows.length} more actors`}
                  </button>
                  <div
                    className={`disclosure-panel ownership-extra-contacts ${
                      itemDisclosureState.isContactsExtraOpen ? "is-open" : ""
                    }`}
                  >
                    <ul className="ownership-extra-list">
                      {extraActorRows.map((entry) => (
                        <li key={entry.key}>
                          <a
                            className="ownership-contact-row"
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
                            {renderActorTeamIcon(iconSpriteHref)}
                            <span className="ownership-actor-main">
                              <span className="ownership-actor-type-label">
                                {entry.typeLabel}
                              </span>
                              <span className="ownership-contact-value">
                                {entry.actor.title || entry.actor.id}
                              </span>
                            </span>
                          </a>
                        </li>
                      ))}
                    </ul>
                  </div>
                </>
              )}
            </div>
          </section>

          <section
            className={`details-inline-block details-inline-block-signals ${
              selectedStatus !== "up" ? "is-degraded" : ""
            }`}
          >
            {hasAffectingSignals && (
              <div className="details-inline-head">
                <p className="ownership-label signals-section-label">
                  Affecting now{" "}
                  <span className="details-panel-count">
                    ({affectingRows.length})
                  </span>
                </p>
              </div>
            )}

            {!hasAffectingSignals && (
              <p className="ownership-label signals-section-label">
                All signals are healthy
              </p>
            )}
            {hasAffectingSignals && (
              <ul className="signals-incident-list">
                {visibleAffectingRows.map((row) => (
                  <li
                    key={row.id}
                    className={`signals-incident-row ${
                      row.typeLabel !== "Own" && row.href ? "is-nav-target" : ""
                    }`}
                  >
                    {row.typeLabel === "Own" ? (
                      <ul className="signals-list signals-sublist signals-group-list">
                        {selectedFailingSignals.map((entry) => (
                          <li key={entry.id} className="signal">
                            <div className="signal-row">
                              <span
                                className={`status-indicator status-${entry.status}`}
                                aria-label={buildStatusText(entry.status)}
                                title={buildStatusText(entry.status)}
                              />
                              <span className="signals-incident-signal-prefix">
                                Own
                              </span>
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
                    ) : row.href ? (
                      <a
                        className="signals-incident-card-link"
                        title={row.title}
                        href={row.href}
                        onClick={row.onClick}
                      >
                        <div className="signals-incident-title">
                          <span
                            className={`status-indicator status-${row.status}`}
                            aria-label={buildStatusText(row.status)}
                            title={buildStatusText(row.status)}
                          />
                          <span className="signals-incident-kind">
                            {row.typeLabel}
                          </span>
                          <span className="signal-name" title={row.title}>
                            {row.title}
                          </span>
                        </div>
                        {row.signals && row.signals.length > 0 && (
                          <ul className="signals-incident-signal-list">
                            {row.signals.map((signalLabel, signalIndex) => (
                              <li
                                key={`${row.id}:${signalIndex}`}
                                className="signals-incident-signal"
                                title={signalLabel}
                              >
                                <span>{signalLabel}</span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </a>
                    ) : (
                      <>
                        <div className="signals-incident-title">
                          <span
                            className={`status-indicator status-${row.status}`}
                            aria-label={buildStatusText(row.status)}
                            title={buildStatusText(row.status)}
                          />
                          <span className="signals-incident-kind">
                            {row.typeLabel}
                          </span>
                          <span className="signal-name" title={row.title}>
                            {row.title}
                          </span>
                        </div>
                        {row.signals && row.signals.length > 0 && (
                          <ul className="signals-incident-signal-list">
                            {row.signals.map((signalLabel, signalIndex) => (
                              <li
                                key={`${row.id}:${signalIndex}`}
                                className="signals-incident-signal"
                                title={signalLabel}
                              >
                                <span>{signalLabel}</span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {hasAffectingSignals &&
              affectingRows.length > AFFECTING_PREVIEW_LIMIT && (
                <button
                  type="button"
                  className="signals-expand-button"
                  onClick={() =>
                    updateDisclosureState({
                      showAllAffecting: !itemDisclosureState.showAllAffecting,
                    })
                  }
                >
                  {itemDisclosureState.showAllAffecting
                    ? `Show ${AFFECTING_PREVIEW_LIMIT} affecting signals`
                    : `Show all ${affectingRows.length} affecting signals`}
                </button>
              )}

            <button
              type="button"
              className="signals-expand-button"
              onClick={() =>
                updateDisclosureState({
                  isHealthyOpen: !itemDisclosureState.isHealthyOpen,
                })
              }
              aria-expanded={itemDisclosureState.isHealthyOpen}
            >
              <span
                className={`details-panel-chevron ${
                  itemDisclosureState.isHealthyOpen ? "is-open" : ""
                }`}
                aria-hidden="true"
              >
                ›
              </span>
              {itemDisclosureState.isHealthyOpen
                ? "Hide healthy signals"
                : `Show ${passingSignalsCount} healthy signals`}
            </button>
            <div
              className={`disclosure-panel ${itemDisclosureState.isHealthyOpen ? "is-open" : ""}`}
            >
              <div className="signals-incident-row">
                <ul className="signals-list signals-sublist signals-group-list">
                  {selectedPassingSignals.length > 0 ? (
                    selectedPassingSignals.map((entry) => (
                      <li key={entry.id} className="signal">
                        <div className="signal-row">
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
                    ))
                  ) : (
                    <li className="signal">
                      <div className="signal-row">
                        <span className="signal-name">
                          {hasOwnHealthSignals
                            ? "No passing health signals right now."
                            : "This item does not have own health signals."}
                        </span>
                      </div>
                    </li>
                  )}
                </ul>
              </div>
            </div>
          </section>
          <section
            className={`details-panel details-panel-grafana ${isGrafanaOpen ? "is-open" : ""}`}
          >
            <button
              type="button"
              className={`details-panel-toggle ${isGrafanaOpen ? "is-open" : ""}`}
              onClick={onToggleGrafana}
              aria-expanded={isGrafanaOpen}
            >
              <span
                className={`details-panel-chevron ${isGrafanaOpen ? "is-open" : ""}`}
                aria-hidden="true"
              >
                ›
              </span>
              <span className="details-panel-title">Timeline</span>
            </button>
            {isGrafanaOpen && (
              <div className="details-panel-body details-panel-body-grafana">
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
    </main>
  );
}
