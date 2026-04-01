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
import type { MutableRefObject } from "react";
import { useEffect, useState } from "react";

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
  dependencyActorsByItemId: Record<
    string,
    { owner: CatalogActor | null; otherActors: CatalogActor[] } | null
  >;
  selectedItemActors: {
    owner: CatalogActor | null;
    otherActors: CatalogActor[];
  } | null;
  actorContactsByActorId: Map<
    string,
    { contacts: CatalogContact[]; primaryContact: CatalogContact | null }
  >;
  hasOwnFailingSignals: boolean;
  isFailingSignalsOpen: boolean;
  onToggleFailingSignals: () => void;
  hasAffectedBySignals: boolean;
  isAffectedBySignalsOpen: boolean;
  onToggleAffectedBySignals: () => void;
  buildItemLink: (itemId: string, pathIds?: string[]) => string;
  onSelectItemByPath: (pathIds: string[]) => void;
  onOpenActor: (actor: CatalogActor) => void;
  isSignalsOpen: boolean;
  onToggleSignals: () => void;
  passingSignalsCount: number;
  selectedPassingSignals: ItemSignal[];
  hasOwnHealthSignals: boolean;
  isPassingSignalsOpen: boolean;
  onTogglePassingSignals: () => void;
  isContactsOpen: boolean;
  onToggleContacts: () => void;
  onOpenContact: (contact: CatalogContact) => void;
  isGrafanaOpen: boolean;
  onToggleGrafana: () => void;
  grafanaHeight: number;
  grafanaIframeRef: MutableRefObject<HTMLIFrameElement | null>;
  onGrafanaLoad: () => void;
  grafanaFrameUrl: string;
};

/**
 * Renders the right-side content area:
 * - selected item title/status
 * - signals panel with failing/passing subsections
 * - Grafana iframe container
 *
 * Layout and adaptive header behavior are controlled by props from App.
 *
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
  dependencyActorsByItemId,
  selectedItemActors,
  actorContactsByActorId,
  hasOwnFailingSignals,
  isFailingSignalsOpen,
  onToggleFailingSignals,
  hasAffectedBySignals,
  isAffectedBySignalsOpen,
  onToggleAffectedBySignals,
  buildItemLink,
  onSelectItemByPath,
  onOpenActor,
  isSignalsOpen,
  onToggleSignals,
  passingSignalsCount,
  selectedPassingSignals,
  hasOwnHealthSignals,
  isPassingSignalsOpen,
  onTogglePassingSignals,
  isContactsOpen,
  onToggleContacts,
  onOpenContact,
  isGrafanaOpen,
  onToggleGrafana,
  grafanaHeight,
  grafanaIframeRef,
  onGrafanaLoad,
  grafanaFrameUrl,
}: DetailsPanelProps) {
  const selectedStatusText = buildStatusText(selectedStatus, { lastUpdated });
  const ownerActorForContacts =
    selectedItemActors?.owner || selectedItemActors?.otherActors?.[0] || null;
  const otherActorsForContacts = selectedItemActors
    ? selectedItemActors.owner
      ? selectedItemActors.otherActors
      : selectedItemActors.otherActors.slice(1)
    : [];
  const contactsActorsCount =
    (ownerActorForContacts ? 1 : 0) + otherActorsForContacts.length;
  const [isContactsOtherOpen, setIsContactsOtherOpen] = useState(false);

  useEffect(() => {
    setIsContactsOtherOpen(false);
  }, [selectedItem?.id]);

  const renderContactChip = (
    contact: CatalogContact,
    { isPrimary = false }: { isPrimary?: boolean } = {},
  ) => {
    const label = resolveContactLabel(contact);
    const icon = (
      <span
        className="contact-type-icon-wrap"
        title={resolveContactTypeDisplayName(contact.type)}
        aria-label={resolveContactTypeDisplayName(contact.type)}
      >
        <svg
          className={`contact-type-icon ${resolveContactTypeClass(contact.type)}`}
          viewBox="0 0 24 24"
          focusable="false"
          aria-hidden="true"
        >
          <use
            href={`${iconSpriteHref}#${resolveContactIconId(contact.type)}`}
          />
        </svg>
      </span>
    );
    const content = (
      <>
        {icon}
        <span className="contact-chip-text">{label}</span>
        {isPrimary && <span className="contact-primary-mark">primary</span>}
      </>
    );

    if (contact.href) {
      return (
        <a
          className="contact-chip actor-modal-contact-chip"
          href={contact.href}
          title={label}
          onClick={(event) => {
            if (!isPlainLeftClick(event)) {
              return;
            }
            event.preventDefault();
            onOpenContact(contact);
          }}
        >
          {content}
        </a>
      );
    }

    return (
      <button
        type="button"
        className="contact-chip actor-modal-contact-chip contact-chip-button"
        onClick={() => onOpenContact(contact)}
        title={label}
      >
        {content}
      </button>
    );
  };

  const renderActorContactsRow = (actor: CatalogActor, roleLabel?: string) => {
    const actorContactsEntry = actorContactsByActorId.get(actor.id) || null;
    const primaryContact = actorContactsEntry?.primaryContact || null;
    const sortedContacts = actorContactsEntry?.contacts || [];

    return (
      <div className="contacts-actor-row" key={actor.id}>
        <div className="contacts-actor-grid">
          <div className="contacts-actor-cell">
            <a
              className="contact-chip contacts-actor-chip"
              href={`/actors/${actor.id}`}
              onClick={(event) => {
                if (!isPlainLeftClick(event)) {
                  return;
                }
                event.preventDefault();
                onOpenActor(actor);
              }}
              title={actor.title || actor.id}
            >
              <span className="contact-chip-text">
                {actor.title || actor.id}
              </span>
              <span className="contacts-actor-type-mark">
                {String(roleLabel || actor.type || "other").toLowerCase()}
              </span>
            </a>
          </div>
          <div className="contacts-actor-contacts-cell">
            {sortedContacts.length > 0 ? (
              <>
                <span className="contacts-actor-contacts-label">Contacts:</span>
                <ul className="actor-modal-contacts contacts-actor-contacts-list">
                  {sortedContacts.map((contact) => {
                    const isPrimaryContact = primaryContact?.id === contact.id;
                    return (
                      <li key={contact.id}>
                        {renderContactChip(contact, {
                          isPrimary: isPrimaryContact,
                        })}
                      </li>
                    );
                  })}
                </ul>
              </>
            ) : (
              <span className="dependency-actor-empty">No contacts</span>
            )}
          </div>
        </div>
      </div>
    );
  };

  const renderActorAndContactCells = (ownerActor: CatalogActor | null) => {
    if (!ownerActor) {
      return (
        <div className="dependency-party">
          <span className="dependency-actor-empty">No primary actor</span>
        </div>
      );
    }
    const primaryContact =
      actorContactsByActorId.get(ownerActor.id)?.primaryContact || null;
    const ownerLabel = ownerActor.title || ownerActor.id;
    const primaryContactLabel = resolveContactLabel(primaryContact);
    return (
      <div className="dependency-party">
        <div className="actor-inline-info">
          <span className="actor-inline-pair">
            <span className="actor-inline-label">Owner:</span>
            <a
              className="contact-chip actor-inline-chip"
              href={`/actors/${ownerActor.id}`}
              onClick={(event) => {
                if (!isPlainLeftClick(event)) {
                  return;
                }
                event.preventDefault();
                onOpenActor(ownerActor);
              }}
              title={ownerLabel}
            >
              <span className="contact-chip-text inline-link-text">
                {ownerLabel}
              </span>
            </a>
          </span>
          {primaryContact && (
            <span className="actor-inline-pair">
              <span className="actor-inline-label">Contact:</span>
              <a
                className="contact-chip actor-inline-chip"
                href={primaryContact.href || `/contacts/${primaryContact.id}`}
                title={primaryContactLabel}
                onClick={(event) => {
                  if (!isPlainLeftClick(event)) {
                    return;
                  }
                  event.preventDefault();
                  onOpenContact(primaryContact);
                }}
              >
                <span
                  className="contact-type-icon-wrap actor-inline-icon-wrap"
                  title={resolveContactTypeDisplayName(primaryContact.type)}
                  aria-label={resolveContactTypeDisplayName(
                    primaryContact.type,
                  )}
                >
                  <svg
                    className={`contact-type-icon ${resolveContactTypeClass(primaryContact.type)}`}
                    viewBox="0 0 24 24"
                    focusable="false"
                    aria-hidden="true"
                  >
                    <use
                      href={`${iconSpriteHref}#${resolveContactIconId(primaryContact.type)}`}
                    />
                  </svg>
                </span>
                <span className="contact-chip-text inline-link-text">
                  {primaryContactLabel}
                </span>
              </a>
            </span>
          )}
        </div>
      </div>
    );
  };

  return (
    <main className="content" ref={contentRef}>
      {!isSidebarOpen && (
        <button
          type="button"
          aria-label="Open catalog panel"
          className="hamburger-toggle sidebar-toggle top-control top-control-button top-control-icon top-control-surface"
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
          <section
            className={`details-panel details-panel-contacts ${isContactsOpen ? "is-open" : ""}`}
          >
            <button
              type="button"
              className={`details-panel-toggle ${isContactsOpen ? "is-open" : ""}`}
              onClick={onToggleContacts}
              aria-expanded={isContactsOpen}
            >
              <span
                className={`details-panel-chevron ${isContactsOpen ? "is-open" : ""}`}
                aria-hidden="true"
              >
                ›
              </span>
              <span className="details-panel-title">
                Contacts{" "}
                <span className="details-panel-count">
                  ({contactsActorsCount})
                </span>
              </span>
            </button>
            {isContactsOpen && (
              <div className="details-panel-body details-panel-body-signals">
                <div className="contacts-actors-block">
                  {ownerActorForContacts ? (
                    renderActorContactsRow(
                      ownerActorForContacts,
                      selectedItemActors?.owner
                        ? "owner"
                        : ownerActorForContacts.type,
                    )
                  ) : (
                    <div className="contacts-actor-row">
                      <span className="dependency-actor-empty">
                        No actors linked to this item
                      </span>
                    </div>
                  )}
                </div>
                {otherActorsForContacts.length > 0 && (
                  <section
                    className={`signals-subsection ${isContactsOtherOpen ? "is-open" : ""}`}
                  >
                    <button
                      type="button"
                      className={`signals-subtoggle ${isContactsOtherOpen ? "is-open" : ""}`}
                      onClick={() => setIsContactsOtherOpen((prev) => !prev)}
                      aria-expanded={isContactsOtherOpen}
                    >
                      <span
                        className={`details-panel-chevron ${isContactsOtherOpen ? "is-open" : ""}`}
                        aria-hidden="true"
                      >
                        ›
                      </span>
                      <span className="signals-subtitle">
                        Other{" "}
                        <span className="details-panel-count">
                          ({otherActorsForContacts.length})
                        </span>
                      </span>
                    </button>
                    {isContactsOtherOpen && (
                      <div className="contacts-actors-block">
                        {otherActorsForContacts.map((actor) =>
                          renderActorContactsRow(actor),
                        )}
                      </div>
                    )}
                  </section>
                )}
              </div>
            )}
          </section>
          <section
            className={`details-panel details-panel-signals ${isSignalsOpen ? "is-open" : ""}`}
          >
            <button
              type="button"
              className={`details-panel-toggle ${isSignalsOpen ? "is-open" : ""}`}
              onClick={onToggleSignals}
              aria-expanded={isSignalsOpen}
            >
              <span
                className={`details-panel-chevron ${isSignalsOpen ? "is-open" : ""}`}
                aria-hidden="true"
              >
                ›
              </span>
              <span className="details-panel-title">Signals</span>
            </button>
            {isSignalsOpen && (
              <div className="details-panel-body details-panel-body-signals">
                {hasOwnFailingSignals && (
                  <section
                    className={`signals-subsection ${isFailingSignalsOpen ? "is-open" : ""}`}
                  >
                    <button
                      type="button"
                      className={`signals-subtoggle ${isFailingSignalsOpen ? "is-open" : ""}`}
                      onClick={onToggleFailingSignals}
                      aria-expanded={isFailingSignalsOpen}
                    >
                      <span
                        className={`details-panel-chevron ${isFailingSignalsOpen ? "is-open" : ""}`}
                        aria-hidden="true"
                      >
                        ›
                      </span>
                      <span className="signals-subtitle">
                        Failing{" "}
                        <span className="details-panel-count">
                          ({selectedFailingSignals.length})
                        </span>
                      </span>
                    </button>
                    {isFailingSignalsOpen && (
                      <ul className="signals-list signals-sublist signals-sublist-affected-by">
                        <li className="dependency own-signals-row">
                          <div className="dependency-main">
                            <ul className="own-failing-signals-list">
                              {selectedFailingSignals.map((entry) => (
                                <li
                                  key={entry.id}
                                  className="signal own-failing-signal"
                                >
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
                              ))}
                            </ul>
                          </div>
                        </li>
                      </ul>
                    )}
                  </section>
                )}
                {hasAffectedBySignals && (
                  <section
                    className={`signals-subsection ${isAffectedBySignalsOpen ? "is-open" : ""}`}
                  >
                    <button
                      type="button"
                      className={`signals-subtoggle ${isAffectedBySignalsOpen ? "is-open" : ""}`}
                      onClick={onToggleAffectedBySignals}
                      aria-expanded={isAffectedBySignalsOpen}
                    >
                      <span
                        className={`details-panel-chevron ${isAffectedBySignalsOpen ? "is-open" : ""}`}
                        aria-hidden="true"
                      >
                        ›
                      </span>
                      <span className="signals-subtitle">
                        Affected by{" "}
                        <span className="details-panel-count">
                          ({failingDependencies.length})
                        </span>
                      </span>
                    </button>
                    {isAffectedBySignalsOpen && (
                      <ul className="signals-list signals-sublist">
                        {failingDependencies.map((entry) => {
                          const dependencyActors =
                            dependencyActorsByItemId[entry.id];
                          return (
                            <li
                              key={entry.id}
                              className="dependency dependency-with-actor"
                            >
                              <div className="dependency-grid">
                                <div className="dependency-main">
                                  <div className="dependency-title">
                                    <span
                                      className={`status-indicator status-${entry.status}`}
                                      aria-label={buildStatusText(entry.status)}
                                      title={buildStatusText(entry.status)}
                                    />
                                    <a
                                      className="signal-link"
                                      title={entry.name}
                                      href={buildItemLink(entry.id, entry.path)}
                                      onClick={(event) => {
                                        if (!isPlainLeftClick(event)) {
                                          return;
                                        }
                                        event.preventDefault();
                                        onSelectItemByPath(entry.path);
                                      }}
                                    >
                                      {entry.name}
                                    </a>
                                  </div>
                                  {entry.failingSignals.length > 0 && (
                                    <ul className="dependency-signals">
                                      {entry.failingSignals.map((signal) => (
                                        <li
                                          key={signal.id}
                                          className="dependency-signal"
                                        >
                                          <span
                                            className="signal-name"
                                            title={signal.title || signal.id}
                                          >
                                            {signal.title || signal.id}
                                          </span>
                                        </li>
                                      ))}
                                    </ul>
                                  )}
                                </div>
                                {renderActorAndContactCells(
                                  dependencyActors?.owner || null,
                                )}
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </section>
                )}
                <section
                  className={`signals-subsection ${isPassingSignalsOpen ? "is-open" : ""}`}
                >
                  <button
                    type="button"
                    className={`signals-subtoggle ${isPassingSignalsOpen ? "is-open" : ""}`}
                    onClick={onTogglePassingSignals}
                    aria-expanded={isPassingSignalsOpen}
                  >
                    <span
                      className={`details-panel-chevron ${isPassingSignalsOpen ? "is-open" : ""}`}
                      aria-hidden="true"
                    >
                      ›
                    </span>
                    <span className="signals-subtitle">
                      Passing{" "}
                      <span className="details-panel-count">
                        ({passingSignalsCount})
                      </span>
                    </span>
                  </button>
                  {isPassingSignalsOpen && (
                    <ul className="signals-list signals-sublist">
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
                  )}
                </section>
              </div>
            )}
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
