/** @file Formats existing Product Health states without inferring or calculating them. */

/** Presentation-only helpers; never compute product health. */
import type { HealthStatus } from "../types";

/** Classifies a reported state as not fully healthy for presentation. */
export const isUnhealthyHealthStatus = (status: HealthStatus): boolean =>
  status !== "up";

type StatusTextOptions = { lastUpdated?: string };

/** Formats a reported health state and optional update time for accessibility. */
export const buildStatusText = (
  status: HealthStatus | string | undefined,
  { lastUpdated }: StatusTextOptions = {},
) =>
  `Status: ${(status || "unknown").toUpperCase()}${lastUpdated ? ` (at ${lastUpdated})` : ""}`;

/** Orders reported health states for display and sorting. */
export const compareHealthStatus = (
  left: HealthStatus,
  right: HealthStatus,
): number => {
  const order: Record<HealthStatus, number> = { down: 0, unknown: 1, up: 2 };
  return order[left] - order[right];
};
