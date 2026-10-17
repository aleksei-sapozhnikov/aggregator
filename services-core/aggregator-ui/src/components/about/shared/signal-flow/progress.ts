export const expandedListHoldMs = 2000;

export const progressBetween = (time: number, start: number, end: number): number =>
  Math.max(0, Math.min(1, (time - start) / (end - start)));

export const smooth = (value: number): number => value * value * (3 - 2 * value);
