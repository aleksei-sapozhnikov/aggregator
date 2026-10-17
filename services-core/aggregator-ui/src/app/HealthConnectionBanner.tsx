/** @file Announces UI connection loss separately from Product Health facts. */

import type { HealthConnectionStatus } from "../shared/types";

type HealthConnectionBannerProps = {
  connectionStatus: HealthConnectionStatus;
  lastSuccessfulFetchAt: number | null;
  disconnectedDetectedAt: number | null;
};

const formatTime = (timestamp: number): string =>
  new Date(timestamp).toLocaleTimeString();

/** Displays the detection time and the freshness of retained health data. */
export default function HealthConnectionBanner({
  connectionStatus,
  lastSuccessfulFetchAt,
  disconnectedDetectedAt,
}: HealthConnectionBannerProps) {
  if (connectionStatus !== "disconnected") {
    return null;
  }

  return (
    <section className="health-connection-banner" role="status" aria-live="polite">
      <span className="health-connection-icon" aria-hidden="true">
        ⊘
      </span>
      <div className="health-connection-message">
        <strong>DISCONNECTED — Connection to Aggregator lost</strong>
        <span>
          {disconnectedDetectedAt === null
            ? "Unable to retrieve current Product Health."
            : `Connection loss detected at ${formatTime(disconnectedDetectedAt)}.`}{" "}
          {lastSuccessfulFetchAt === null
            ? "No Product Health data has been received yet."
            : `Showing last known health from ${formatTime(lastSuccessfulFetchAt)}. Current health may have changed.`}
        </span>
      </div>
    </section>
  );
}
