/** Presentation-only helpers; never compute product health. */
import type { HealthStatus } from "../types";

export const isUnhealthyHealthStatus = (status: HealthStatus): boolean => status !== "up";

type StatusTextOptions = { lastUpdated?: string };

export const buildStatusText = (
  status: HealthStatus | string | undefined,
  { lastUpdated }: StatusTextOptions = {},
) => `Status: ${(status || "unknown").toUpperCase()}${lastUpdated ? ` (at ${lastUpdated})` : ""}`;
