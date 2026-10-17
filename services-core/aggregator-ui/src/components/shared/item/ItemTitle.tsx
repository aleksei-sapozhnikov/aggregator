/** @file Renders Item heading, reported status, and catalog information trigger. */

import type { RefObject } from "react";
import type { CatalogItem, HealthStatus } from "../../../shared/types";
import { buildStatusText } from "../../../shared/health/healthPresentation";
import CatalogItemInfo from "./CatalogItemInfo";

/** Renders the current Item's name, status indicator, and catalog description help. */
export default function ItemTitle({
  item,
  status,
  lastUpdated,
  showHealthStatus = true,
  isLastKnownHealth = false,
  firstWord,
  rest = "",
  primaryRef,
  interactive = true,
}: {
  item?: CatalogItem;
  status: HealthStatus;
  lastUpdated?: string;
  showHealthStatus?: boolean;
  isLastKnownHealth?: boolean;
  firstWord: string;
  rest?: string;
  primaryRef?: RefObject<HTMLElement | null>;
  interactive?: boolean;
}) {
  const statusText = buildStatusText(status, {
    lastUpdated,
    lastKnown: isLastKnownHealth,
  });
  return (
    <div className="content-title">
      <span className="content-title-primary" ref={primaryRef}>
        {item && showHealthStatus && (
          <span
            className={`status-indicator status-${status}`}
            aria-label={statusText}
            title={statusText}
          />
        )}
        <span className="content-title-text content-title-text-first">
          {firstWord}
        </span>
      </span>
      {rest && (
        <span className="content-title-text content-title-text-rest">
          {rest}
        </span>
      )}
      {item && <CatalogItemInfo item={item} interactive={interactive} />}
      {item && showHealthStatus && status !== "up" && (
        <span className={`content-status-label status-${status}`}>
          {status.toUpperCase()}
        </span>
      )}
      {item && isLastKnownHealth && (
        <span className="health-last-known-label">Last known</span>
      )}
    </div>
  );
}
