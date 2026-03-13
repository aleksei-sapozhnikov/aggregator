/**
 * @file Main details panel UI for the selected catalog item.
 */

import TopBarActions from './TopBarActions';
import {isPlainLeftClick} from '../shared/catalogUtils';
import {buildStatusText} from '../shared/statusText';
import type {
    CatalogContact,
    CatalogItem,
    FailingDependencyEntry,
    HealthStatus,
    ItemSignal,
} from '../shared/types';
import type {MutableRefObject} from 'react';

const contactTypeIconById: Record<string, string> = {
    email: 'icon-contact-email',
    phone: 'icon-contact-phone',
    sms: 'icon-contact-sms',
    slack: 'icon-contact-slack',
    teams: 'icon-contact-teams',
    telegram: 'icon-contact-telegram',
    discord: 'icon-contact-discord',
    mattermost: 'icon-contact-mattermost',
    pagerduty: 'icon-contact-pagerduty',
    opsgenie: 'icon-contact-opsgenie',
    other: 'icon-contact-other',
};

const contactTypeDisplayNameById: Record<string, string> = {
    email: 'Email',
    phone: 'Phone',
    sms: 'SMS',
    slack: 'Slack',
    teams: 'MS Teams',
    telegram: 'Telegram',
    discord: 'Discord',
    mattermost: 'Mattermost',
    pagerduty: 'PagerDuty',
    opsgenie: 'Opsgenie',
    other: 'Other',
};

const resolveContactIconId = (contactType?: string): string => {
    if (!contactType) {
        return contactTypeIconById.other;
    }
    return contactTypeIconById[contactType] || contactTypeIconById.other;
};

const resolveContactTypeDisplayName = (contactType?: string): string => {
    if (!contactType) {
        return contactTypeDisplayNameById.other;
    }
    return contactTypeDisplayNameById[contactType] || contactTypeDisplayNameById.other;
};

const resolveContactTypeClass = (contactType?: string): string => {
    if (!contactType || !(contactType in contactTypeIconById)) {
        return 'contact-type-other';
    }
    return `contact-type-${contactType}`;
};

const resolveContactLabel = (contact?: CatalogContact): string => {
    if (!contact) {
        return 'Unknown contact';
    }
    const title = String(contact.title || '').trim();
    if (title) {
        return title;
    }
    return 'Unnamed contact';
};

type DetailsPanelProps = {
    contentRef: MutableRefObject<HTMLElement | null>;
    isSidebarOpen: boolean;
    iconSpriteHref: string;
    onToggleSidebar: () => void;
    shouldOffsetContentHeader: boolean;
    isTitlePrimaryBelowControls: boolean;
    headerRef: MutableRefObject<HTMLElement | null>;
    headerActionsRef: MutableRefObject<HTMLDivElement | null>;
    theme: 'dark' | 'light';
    onToggleTheme: () => void;
    onOpenFeedback: () => void;
    onOpenAbout: () => void;
    selectedItem: CatalogItem | undefined;
    selectedStatus: HealthStatus;
    lastUpdated: string;
    selectedTitleFirstWord: string;
    selectedTitleRest: string;
    contentTitlePrimaryRef: MutableRefObject<HTMLElement | null>;
    failingSignalsCount: number;
    selectedFailingSignals: ItemSignal[];
    failingDependencies: FailingDependencyEntry[];
    hasFailingSignals: boolean;
    isFailingSignalsOpen: boolean;
    onToggleFailingSignals: () => void;
    buildItemLink: (itemId: string, pathIds?: string[]) => string;
    onSelectItemByPath: (pathIds: string[]) => void;
    passingSignalsCount: number;
    selectedPassingSignals: ItemSignal[];
    hasOwnHealthSignals: boolean;
    isPassingSignalsOpen: boolean;
    onTogglePassingSignals: () => void;
    selectedContacts: CatalogContact[];
    contactsCount: number;
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
 * - failing/passing signals panels
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
    failingSignalsCount,
    selectedFailingSignals,
    failingDependencies,
    hasFailingSignals,
    isFailingSignalsOpen,
    onToggleFailingSignals,
    buildItemLink,
    onSelectItemByPath,
    passingSignalsCount,
    selectedPassingSignals,
    hasOwnHealthSignals,
    isPassingSignalsOpen,
    onTogglePassingSignals,
    selectedContacts,
    contactsCount,
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
    const selectedStatusText = buildStatusText(selectedStatus, {lastUpdated});

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
                        <use href={`${iconSpriteHref}#icon-menu`}/>
                    </svg>
                </button>
            )}
            <header
                className={`content-header ${
                    shouldOffsetContentHeader ? 'content-header-with-toggle' : ''
                } ${isTitlePrimaryBelowControls ? 'content-header-primary-below-controls' : ''}`}
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
                        <span className="content-title-primary" ref={contentTitlePrimaryRef}>
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
                        {selectedItem && selectedStatus !== 'up' && (
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
                    {hasFailingSignals && (
                        <section
                            className={`details-panel details-panel-failing ${
                                isFailingSignalsOpen ? 'is-open' : ''
                            }`}
                        >
                            <button
                                type="button"
                                className={`details-panel-toggle ${isFailingSignalsOpen ? 'is-open' : ''}`}
                                onClick={onToggleFailingSignals}
                                aria-expanded={isFailingSignalsOpen}
                            >
                                <span
                                    className={`details-panel-chevron ${isFailingSignalsOpen ? 'is-open' : ''}`}
                                    aria-hidden="true"
                                >
                                    ›
                                </span>
                                <span className={`details-panel-title ${isFailingSignalsOpen ? 'is-open' : ''}`}>
                                    Failing
                                    {' '}
                                    <span className="details-panel-count">({failingSignalsCount})</span>
                                </span>
                            </button>
                            {isFailingSignalsOpen && (
                                <ul className="signals-list">
                                    {selectedFailingSignals.map((entry) => (
                                        <li key={entry.id} className="signal">
                                            <div className="signal-row">
                                                <span
                                                    className={`status-indicator status-${entry.status}`}
                                                    aria-label={buildStatusText(entry.status)}
                                                    title={buildStatusText(entry.status)}
                                                />
                                                <span className="signal-name" title={entry.name || entry.id}>
                                                    {entry.name || entry.id}
                                                </span>
                                            </div>
                                        </li>
                                    ))}
                                    {failingDependencies.length > 0 && (
                                        <li
                                            className={`dependency-group-title ${
                                                selectedFailingSignals.length > 0
                                                    ? 'has-separator'
                                                    : ''
                                            }`}
                                        >
                                            Affected by
                                        </li>
                                    )}
                                    {failingDependencies.map((entry) => (
                                        <li key={entry.id} className="dependency">
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
                                                        <li key={signal.id} className="dependency-signal">
                                                            <span
                                                                className="signal-name"
                                                                title={signal.name || signal.id}
                                                            >
                                                                {signal.name || signal.id}
                                                            </span>
                                                        </li>
                                                    ))}
                                                </ul>
                                            )}
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </section>
                    )}
                    <section
                        className={`details-panel details-panel-passing ${
                            isPassingSignalsOpen ? 'is-open' : ''
                        }`}
                    >
                        <button
                            type="button"
                            className={`details-panel-toggle ${isPassingSignalsOpen ? 'is-open' : ''}`}
                            onClick={onTogglePassingSignals}
                            aria-expanded={isPassingSignalsOpen}
                        >
                            <span
                                className={`details-panel-chevron ${isPassingSignalsOpen ? 'is-open' : ''}`}
                                aria-hidden="true"
                            >
                                ›
                            </span>
                            <span className={`details-panel-title ${isPassingSignalsOpen ? 'is-open' : ''}`}>
                                Passing
                                {' '}
                                <span className="details-panel-count">({passingSignalsCount})</span>
                            </span>
                        </button>
                        {isPassingSignalsOpen && (
                            <ul className="signals-list">
                                {selectedPassingSignals.length > 0 ? (
                                    selectedPassingSignals.map((entry) => (
                                        <li key={entry.id} className="signal">
                                            <div className="signal-row">
                                                <span
                                                    className={`status-indicator status-${entry.status}`}
                                                    aria-label={buildStatusText(entry.status)}
                                                    title={buildStatusText(entry.status)}
                                                />
                                                <span className="signal-name" title={entry.name || entry.id}>
                                                    {entry.name || entry.id}
                                                </span>
                                            </div>
                                        </li>
                                    ))
                                ) : (
                                    <li className="signal">
                                        <div className="signal-row">
                                            <span className="signal-name">
                                                {hasOwnHealthSignals
                                                    ? 'No passing health signals right now.'
                                                    : 'This item does not have own health signals.'}
                                            </span>
                                        </div>
                                    </li>
                                )}
                            </ul>
                        )}
                    </section>
                    <section
                        className={`details-panel details-panel-contacts ${isContactsOpen ? 'is-open' : ''}`}
                    >
                        <button
                            type="button"
                            className={`details-panel-toggle ${isContactsOpen ? 'is-open' : ''}`}
                            onClick={onToggleContacts}
                            aria-expanded={isContactsOpen}
                        >
                            <span
                                className={`details-panel-chevron ${isContactsOpen ? 'is-open' : ''}`}
                                aria-hidden="true"
                            >
                                ›
                            </span>
                            <span className={`details-panel-title ${isContactsOpen ? 'is-open' : ''}`}>
                                Contacts
                                {' '}
                                <span className="details-panel-count">({contactsCount})</span>
                            </span>
                        </button>
                        {isContactsOpen && (
                            <ul className="signals-list">
                                {selectedContacts.length > 0 ? (
                                    selectedContacts.map((contact) => (
                                        <li key={contact.id} className="signal">
                                            {contact.href ? (
                                                <a
                                                    className="contact-chip"
                                                    href={contact.href}
                                                    title={resolveContactLabel(contact)}
                                                    onClick={(event) => {
                                                        event.preventDefault();
                                                        onOpenContact(contact);
                                                    }}
                                                >
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
                                                            <use href={`${iconSpriteHref}#${resolveContactIconId(contact.type)}`}/>
                                                        </svg>
                                                    </span>
                                                    <span className="contact-chip-text">{resolveContactLabel(contact)}</span>
                                                </a>
                                            ) : (
                                                <button
                                                    type="button"
                                                    className="contact-chip contact-chip-button"
                                                    onClick={() => onOpenContact(contact)}
                                                >
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
                                                            <use href={`${iconSpriteHref}#${resolveContactIconId(contact.type)}`}/>
                                                        </svg>
                                                    </span>
                                                    <span className="contact-chip-text">{resolveContactLabel(contact)}</span>
                                                </button>
                                            )}
                                        </li>
                                    ))
                                ) : (
                                    <li className="signal">
                                        <div className="signal-row">
                                            <span className="signal-name">
                                                No contacts configured for this item.
                                            </span>
                                        </div>
                                    </li>
                                )}
                            </ul>
                        )}
                    </section>
                    <section
                        className={`details-panel details-panel-grafana ${isGrafanaOpen ? 'is-open' : ''}`}
                    >
                        <button
                            type="button"
                            className={`details-panel-toggle ${isGrafanaOpen ? 'is-open' : ''}`}
                            onClick={onToggleGrafana}
                            aria-expanded={isGrafanaOpen}
                        >
                            <span
                                className={`details-panel-chevron ${isGrafanaOpen ? 'is-open' : ''}`}
                                aria-hidden="true"
                            >
                                ›
                            </span>
                            <span className={`details-panel-title ${isGrafanaOpen ? 'is-open' : ''}`}>
                                Timeline
                            </span>
                        </button>
                        {isGrafanaOpen && (
                            <div className="details-panel-body details-panel-body-grafana">
                                <div className="grafana-grid">
                                    <section
                                        className="grafana-panel"
                                        style={grafanaHeight ? {height: `${grafanaHeight}px`} : undefined}
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
