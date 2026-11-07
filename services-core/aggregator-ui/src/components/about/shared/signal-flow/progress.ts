/** @file Provides reusable normalized progress and easing functions for help scenes. */

export const expandedListHoldMs = 2000;

/** Returns clamped progress through a specified animation interval. */
export const progressBetween = (
  time: number,
  start: number,
  end: number,
): number => Math.max(0, Math.min(1, (time - start) / (end - start)));

/** Applies easing to a normalized animation progress value. */
export const smooth = (value: number): number =>
  value * value * (3 - 2 * value);
