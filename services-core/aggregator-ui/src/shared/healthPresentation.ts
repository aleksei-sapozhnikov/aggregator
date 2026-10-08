/**
 * @file Presentation helpers for health facts.
 */
import type { HealthStatus } from "./types";

export const isUnhealthyHealthStatus = (status: HealthStatus): boolean =>
  status !== "up";
