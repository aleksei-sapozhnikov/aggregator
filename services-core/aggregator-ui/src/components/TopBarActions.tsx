/**
 * @file Header action buttons shared by the details panel top bar.
 */

type TopBarActionsProps = {
  theme: "dark" | "light";
  onToggleTheme: () => void;
  onOpenFeedback: () => void;
  onOpenAbout: () => void;
};

/**
 * Renders top-bar actions for theme switching and opening the About dialog.
 *
 */
export default function TopBarActions({
  theme,
  onToggleTheme,
  onOpenFeedback,
  onOpenAbout,
}: TopBarActionsProps) {
  return (
    <>
      <button
        type="button"
        className="theme-toggle top-control top-control-button top-control-pill top-control-surface"
        onClick={onToggleTheme}
      >
        <span className="theme-toggle-icon" aria-hidden="true">
          <svg
            className="theme-toggle-glyph"
            viewBox="0 0 24 24"
            width="14"
            height="14"
            focusable="false"
          >
            <use
              href={
                theme === "dark"
                  ? "/icons.svg#icon-theme-light"
                  : "/icons.svg#icon-theme-dark"
              }
            />
          </svg>
        </span>
        <span className="theme-toggle-text">
          {theme === "dark" ? "Go light" : "Go dark"}
        </span>
      </button>
      <button
        type="button"
        className="feedback-toggle top-control top-control-button top-control-pill top-control-surface"
        onClick={onOpenFeedback}
      >
        <span className="theme-toggle-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="14" height="14" focusable="false">
            <use href="/icons.svg#feedback-mark" />
          </svg>
        </span>
        <span className="theme-toggle-text">Feedback</span>
      </button>
      <button
        type="button"
        className="about-toggle top-control top-control-button top-control-pill top-control-surface top-control-accent"
        onClick={onOpenAbout}
      >
        <span className="theme-toggle-icon" aria-hidden="true">
          ?
        </span>
        <span className="theme-toggle-text">About</span>
      </button>
    </>
  );
}
