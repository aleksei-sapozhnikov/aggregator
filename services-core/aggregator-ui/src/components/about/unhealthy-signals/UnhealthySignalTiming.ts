/** Unhealthy signal animation timings in milliseconds.
 * The next service turns red exactly when the incoming signal arrives.
 * Holding periods after arrivals match the original storyline.
 */
export const unhealthyTiming = {
  failureStart: 1500,
  firstLinkStart: 2400,
  firstLinkEnd: 3120,
  dependencyAffectedAt: 3120,
  secondLinkStart: 3620,
  secondLinkEnd: 4420,
  itemAffectedAt: 4420,
  selectionStart: 5620,
  selectionFull: 6620,
  presentationStart: 6920,
  presentationEnd: 8620,
  pageHoldAt: 11120,
  reverseStart: 12920,
  reverseEnd: 14720,
  selectionFadeStart: 16220,
  selectionFadeEnd: 16920,
  leafRecoveredAt: 17520,
  firstRecoveryStart: 18120,
  firstRecoveryEnd: 19620,
  dependencyRecoveredAt: 19820,
  secondRecoveryStart: 20420,
  secondRecoveryEnd: 21920,
  itemRecoveredAt: 22120,
  resetAt: 22120,
} as const;
