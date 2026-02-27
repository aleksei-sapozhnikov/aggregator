/**
 * @file Main details panel UI for the selected catalog item.
 */

import TopBarActions from './TopBarActions';
import {buildStatusText} from '../shared/statusText';

/**
 * Renders the right-side content area:
 * - selected item title/status
 * - affected items and health checks panels
 * - Grafana iframe container
 *
 * Layout and adaptive header behavior are controlled by props from App.
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
    affectedItems,
    isAffectedOpen,
    onToggleAffected,
    buildItemLink,
    onSelectItemByIdNoPath,
    selectedChecks,
    isChecksOpen,
    onToggleChecks,
    checksSummaryText,
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
                    {selectedStatus !== 'up' && affectedItems.length > 0 && (
                        <section className={`affected-panel ${isAffectedOpen ? 'is-open' : ''}`}>
                            <button
                                type="button"
                                className={`affected-toggle ${isAffectedOpen ? 'is-open' : ''}`}
                                onClick={onToggleAffected}
                                aria-expanded={isAffectedOpen}
                            >
                                <span
                                    className={`affected-chevron ${isAffectedOpen ? 'is-open' : ''}`}
                                    aria-hidden="true"
                                >
                                    ›
                                </span>
                                <span className={`affected-summary ${isAffectedOpen ? 'is-open' : ''}`}>
                                    Affected by {affectedItems.length} item
                                    {affectedItems.length === 1 ? '' : 's'}
                                    {!isAffectedOpen && affectedItems.length > 0
                                        ? `: ${affectedItems.map((entry) => entry.name).join(', ')}`
                                        : ''}
                                </span>
                            </button>
                            {isAffectedOpen && (
                                <ul className="affected-list">
                                    {affectedItems.length === 0 ? (
                                        <li className="affected-empty">
                                            No degraded dependent services detected.
                                        </li>
                                    ) : (
                                        affectedItems.map((entry) => (
                                            <li key={entry.id} className="affected-item">
                                                <span
                                                    className={`status-indicator status-${entry.status}`}
                                                    aria-label={buildStatusText(entry.status)}
                                                    title={buildStatusText(entry.status)}
                                                />
                                                <div className="affected-meta">
                                                    <div className="affected-row">
                                                        <a
                                                            className="affected-link"
                                                            title={entry.name}
                                                            href={buildItemLink(entry.id)}
                                                            onClick={(event) => {
                                                                event.preventDefault();
                                                                onSelectItemByIdNoPath(entry.id);
                                                            }}
                                                        >
                                                            {entry.name}
                                                        </a>
                                                    </div>
                                                </div>
                                            </li>
                                        ))
                                    )}
                                </ul>
                            )}
                        </section>
                    )}
                    {selectedChecks.length > 0 && (
                        <section className={`affected-panel ${isChecksOpen ? 'is-open' : ''}`}>
                            <button
                                type="button"
                                className={`affected-toggle ${isChecksOpen ? 'is-open' : ''}`}
                                onClick={onToggleChecks}
                                aria-expanded={isChecksOpen}
                            >
                                <span
                                    className={`affected-chevron ${isChecksOpen ? 'is-open' : ''}`}
                                    aria-hidden="true"
                                >
                                    ›
                                </span>
                                <span className={`affected-summary ${isChecksOpen ? 'is-open' : ''}`}>
                                    {checksSummaryText}
                                </span>
                            </button>
                            {isChecksOpen && (
                                <ul className="affected-list">
                                    {selectedChecks.map((entry) => (
                                        <li key={entry.id} className="affected-item">
                                            <span
                                                className={`status-indicator status-${entry.status}`}
                                                aria-label={buildStatusText(entry.status)}
                                                title={buildStatusText(entry.status)}
                                            />
                                            <div className="affected-meta">
                                                <div className="affected-row">
                                                    <span
                                                        className="affected-name"
                                                        title={entry.name || entry.id}
                                                    >
                                                        {entry.name || entry.id}
                                                    </span>
                                                </div>
                                            </div>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </section>
                    )}
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
                </>
            )}
        </main>
    );
}
