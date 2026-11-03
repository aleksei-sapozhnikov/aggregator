/**
 * @file Application-level toolbar actions.
 */

type AppToolbarProps = {
  theme: "dark" | "light";
  isAiChatOpen: boolean;
  onToggleAiChat: () => void;
  onToggleTheme: () => void;
  onOpenAbout: () => void;
};

/**
 * Renders top-bar actions for theme switching and opening the About dialog.
 *
 */
export default function AppToolbar({
  theme,
  isAiChatOpen,
  onToggleAiChat,
  onToggleTheme,
  onOpenAbout,
}: AppToolbarProps) {
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
        className={`ai-chat-toggle top-control top-control-button top-control-pill top-control-surface ${
          isAiChatOpen ? "is-active" : ""
        }`}
        onClick={onToggleAiChat}
        aria-pressed={isAiChatOpen}
      >
        <span
          className="theme-toggle-icon ai-chat-toggle-icon"
          aria-hidden="true"
        >
          AI
        </span>
        <span className="theme-toggle-text">AI chat</span>
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
