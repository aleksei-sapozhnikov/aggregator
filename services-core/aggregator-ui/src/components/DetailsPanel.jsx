/**
 * @file Main details panel UI for the selected catalog item.
 */

import TopBarActions from './TopBarActions';
import {isPlainLeftClick} from '../shared/catalogUtils';
import {buildStatusText} from '../shared/statusText';
/** @typedef {import('../shared/types').CatalogItem} CatalogItem */
/** @typedef {import('../shared/types').FailingDependencyEntry} FailingDependencyEntry */
/** @typedef {import('../shared/types').HealthStatus} HealthStatus */
/** @typedef {import('../shared/types').ItemSignal} ItemSignal */

/**
 * @typedef {Object} DetailsPanelProps
 * @property {{current: HTMLElement | null}} contentRef
 * @property {boolean} isSidebarOpen
 * @property {string} iconSpriteHref
 * @property {() => void} onToggleSidebar
 * @property {boolean} shouldOffsetContentHeader
 * @property {boolean} isTitlePrimaryBelowControls
 * @property {{current: HTMLElement | null}} headerRef
 * @property {{current: HTMLElement | null}} headerActionsRef
 * @property {'dark' | 'light'} theme
 * @property {() => void} onToggleTheme
 * @property {() => void} onOpenAbout
 * @property {CatalogItem | undefined} selectedItem
 * @property {HealthStatus} selectedStatus
 * @property {string} lastUpdated
 * @property {string} selectedTitleFirstWord
 * @property {string} selectedTitleRest
 * @property {{current: HTMLElement | null}} contentTitlePrimaryRef
 * @property {number} failingSignalsCount
 * @property {ItemSignal[]} selectedFailingSignals
 * @property {FailingDependencyEntry[]} failingDependencies
 * @property {boolean} hasFailingSignals
 * @property {boolean} isFailingSignalsOpen
 * @property {() => void} onToggleFailingSignals
 * @property {(itemId: string, pathIds?: string[]) => string} buildItemLink
 * @property {(pathIds: string[]) => void} onSelectItemByPath
 * @property {number} passingSignalsCount
 * @property {ItemSignal[]} selectedPassingSignals
 * @property {boolean} hasOwnHealthSignals
 * @property {boolean} isPassingSignalsOpen
 * @property {() => void} onTogglePassingSignals
 * @property {boolean} isGrafanaOpen
 * @property {() => void} onToggleGrafana
 * @property {number} grafanaHeight
 * @property {{current: HTMLIFrameElement | null}} grafanaIframeRef
 * @property {() => void} onGrafanaLoad
 * @property {string} grafanaFrameUrl
 */

/**
 * Renders the right-side content area:
 * - selected item title/status
 * - failing/passing signals panels
 * - Grafana iframe container
 *
 * Layout and adaptive header behavior are controlled by props from App.
 *
 * @param {DetailsPanelProps} props
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
    isGrafanaOpen,
    onToggleGrafana,
    grafanaHeight,
    grafanaIframeRef,
    onGrafanaLoad,
    grafanaFrameUrl,
}) {
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
