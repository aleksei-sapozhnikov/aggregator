/** @file Positions the application toolbar, Item heading, and feature content. */

import type { ReactNode, RefObject } from "react";
import AppToolbar from "./AppToolbar";
import HealthConnectionBanner from "./HealthConnectionBanner";
import ItemTitle from "../components/shared/item/ItemTitle";
import type {
  CatalogItem,
  DisplayHealthStatus,
  HealthConnectionStatus,
} from "../shared/types";

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
  isAiChatOpen: boolean;
  onToggleAiChat: () => void;
  onOpenAbout: () => void;
  selectedItem: CatalogItem | undefined;
  selectedStatus: DisplayHealthStatus;
  lastUpdated: string;
  hasHealthSnapshot?: boolean;
  isLastKnownHealth?: boolean;
  connectionStatus?: HealthConnectionStatus;
  lastSuccessfulFetchAt?: number | null;
  disconnectedDetectedAt?: number | null;
  selectedTitleFirstWord: string;
  selectedTitleRest: string;
};

/** Application workspace layout; independent of Item details and AI chat content. */
export default function AppLayout({
  children,
  chat,
  contentRef,
  headerRef,
  headerActionsRef,
  contentTitlePrimaryRef,
  isCatalogOpen,
  iconSpriteHref,
  onToggleCatalog,
  shouldOffsetContentHeader,
  isTitlePrimaryBelowControls,
  isAiChatOpen,
  onToggleAiChat,
  onOpenAbout,
  selectedItem,
  selectedStatus,
  lastUpdated,
  hasHealthSnapshot = true,
  isLastKnownHealth = false,
  connectionStatus = "connecting",
  lastSuccessfulFetchAt = null,
  disconnectedDetectedAt = null,
  selectedTitleFirstWord,
  selectedTitleRest,
}: AppLayoutProps) {
  return (
    <main className="content" ref={contentRef}>
      {!isCatalogOpen && (
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
            isAiChatOpen={isAiChatOpen}
            onToggleAiChat={onToggleAiChat}
            onOpenAbout={onOpenAbout}
          />
        </div>
        <div className="content-header-main">
          <ItemTitle
            item={selectedItem}
            status={selectedStatus}
            lastUpdated={lastUpdated}
            showHealthStatus={hasHealthSnapshot}
            isLastKnownHealth={isLastKnownHealth}
            firstWord={selectedTitleFirstWord}
            rest={selectedTitleRest}
            primaryRef={contentTitlePrimaryRef}
          />
        </div>
      </header>
      <HealthConnectionBanner
        connectionStatus={connectionStatus}
        lastSuccessfulFetchAt={lastSuccessfulFetchAt}
        disconnectedDetectedAt={disconnectedDetectedAt}
      />
      <div
        className={`content-workspace ${isAiChatOpen ? "ai-chat-open" : ""}`}
      >
        <div className="item-details-column">{children}</div>
        {chat}
      </div>
    </main>
  );
}
