import type { RefObject } from "react";
import type { CatalogItem, HealthStatus } from "../shared/types";
import { buildStatusText } from "../shared/statusText";
import CatalogItemInfo from "./CatalogItemInfo";

export default function ItemTitle({
  item, status, lastUpdated, firstWord, rest = "", primaryRef, interactive = true,
}: {
  item?: CatalogItem;
  status: HealthStatus;
  lastUpdated?: string;
  firstWord: string;
  rest?: string;
  primaryRef?: RefObject<HTMLElement | null>;
  interactive?: boolean;
}) {
  const statusText = buildStatusText(status, { lastUpdated });
  return (
    <div className="content-title">
      <span className="content-title-primary" ref={primaryRef}>
        {item && (
          <span className={`status-indicator status-${status}`}
            aria-label={statusText} title={statusText} />
        )}
        <span className="content-title-text content-title-text-first">{firstWord}</span>
      </span>
      {rest && <span className="content-title-text content-title-text-rest">{rest}</span>}
      {item && <CatalogItemInfo item={item} interactive={interactive} />}
      {item && status !== "up" && (
        <span className={`content-status-label status-${status}`}>{status.toUpperCase()}</span>
      )}
    </div>
  );
}
