/** Presentation-only helpers; never compute product health. */
import type { HealthStatus } from "../types";

export const isUnhealthyHealthStatus = (status: HealthStatus): boolean => status !== "up";

type StatusTextOptions = { lastUpdated?: string };

export const buildStatusText = (
  status: HealthStatus | string | undefined,
  { lastUpdated }: StatusTextOptions = {},
) => `Status: ${(status || "unknown").toUpperCase()}${lastUpdated ? ` (at ${lastUpdated})` : ""}`;

export const compareHealthStatus = (
  left: HealthStatus,
  right: HealthStatus,
): number => {
  const order: Record<HealthStatus, number> = { down: 0, unknown: 1, up: 2 };
  return order[left] - order[right];
};
