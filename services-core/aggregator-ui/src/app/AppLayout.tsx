import type { ReactNode, RefObject } from "react";
import AppToolbar from "./AppToolbar";
import ItemTitle from "../components/shared/item/ItemTitle";
import type { CatalogItem, HealthStatus } from "../shared/types";

type AppLayoutProps = {
  children: ReactNode;
  chat: ReactNode;
  contentRef: RefObject<HTMLElement | null>;
  headerRef: RefObject<HTMLElement | null>;
  headerActionsRef: RefObject<HTMLDivElement | null>;
  contentTitlePrimaryRef: RefObject<HTMLElement | null>;
  isCatalogOpen: boolean;
  iconSpriteHref: string;
  onToggleCatalog: () => void;
  shouldOffsetContentHeader: boolean;
  isTitlePrimaryBelowControls: boolean;
  theme: "dark" | "light";
  isAiChatOpen: boolean;
  onToggleAiChat: () => void;
  onToggleTheme: () => void;
  onOpenAbout: () => void;
  selectedItem: CatalogItem | undefined;
  selectedStatus: HealthStatus;
  lastUpdated: string;
  selectedTitleFirstWord: string;
  selectedTitleRest: string;
};

/** Application workspace layout; independent of Item details and AI chat content. */
export default function AppLayout({
  children, chat, contentRef, headerRef, headerActionsRef, contentTitlePrimaryRef,
  isCatalogOpen, iconSpriteHref, onToggleCatalog, shouldOffsetContentHeader,
  isTitlePrimaryBelowControls, theme, isAiChatOpen, onToggleAiChat, onToggleTheme,
  onOpenAbout, selectedItem, selectedStatus, lastUpdated, selectedTitleFirstWord,
  selectedTitleRest,
}: AppLayoutProps) {
  return (
    <main className="content" ref={contentRef}>
      {!isCatalogOpen && (
        <button
          type="button"
          aria-label="Open catalog panel"
          className={[
            "hamburger-toggle", "sidebar-toggle", "top-control", "top-control-button",
            "top-control-icon", "top-control-surface",
          ].join(" ")}
          onClick={onToggleCatalog}
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
          <AppToolbar
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
      <div className={`content-workspace ${isAiChatOpen ? "ai-chat-open" : ""}`}>
        <div className="item-details-column">{children}</div>
        {chat}
      </div>
    </main>
  );
}
