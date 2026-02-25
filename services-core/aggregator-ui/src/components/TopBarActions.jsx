/**
 * @file Header action buttons shared by the details panel top bar.
 */

/**
 * Renders top-bar actions for theme switching and opening the About dialog.
 */
export default function TopBarActions({
    theme,
    onToggleTheme,
    onOpenAbout,
}) {
    return (
        <>
            <button
                type="button"
                className="theme-toggle top-control top-control-button top-control-pill top-control-surface"
                onClick={onToggleTheme}
            >
                <span className="theme-toggle-icon" aria-hidden="true">
                    {theme === 'dark' ? '💡' : '🌙'}
                </span>
                <span className="theme-toggle-text">
                    {theme === 'dark' ? 'Go light' : 'Go dark'}
                </span>
            </button>
            <button
                type="button"
                className="about-toggle top-control top-control-button top-control-pill top-control-surface top-control-accent"
                onClick={onOpenAbout}
            >
                <span className="theme-toggle-icon" aria-hidden="true">?</span>
                <span className="theme-toggle-text">About</span>
            </button>
        </>
    );
}
