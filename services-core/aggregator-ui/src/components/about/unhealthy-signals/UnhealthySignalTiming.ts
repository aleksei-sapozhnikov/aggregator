/** @file Defines shared timing milestones for failing and recovering signal animations. */

/**
 * Unhealthy signal animation timings in milliseconds (excluding the 2-second
 * expanded Item pause, which is inserted at pageHoldAt).
 *
 * A node changes health exactly when the incoming propagation reaches it.
 * Keep the red diagram for 250 ms, hold the complete Item for two seconds,
 * then propagate recovery along both edges at the same speed as failure.
 */
export const unhealthyTiming = {
  failureStart: 1500,
  firstLinkStart: 2400,
  firstLinkEnd: 3120,
  dependencyAffectedAt: 3120,
  secondLinkStart: 3620,
  secondLinkEnd: 4420,
  itemAffectedAt: 4420,
  // The full red graph remains visible for 250 ms before the morph.
  selectionStart: 4620,
  selectionFull: 5020,
  presentationStart: 4670,
  presentationEnd: 6370,
  // Pause the completed page itself; do not insert extra transition time.
  pageHoldAt: 6370,
  reverseStart: 6370,
  reverseEnd: 8070,
  selectionFadeStart: 7670,
  selectionFadeEnd: 8070,
  // Restore the leaf, then advance green edges with 500 ms between stages.
  leafRecoveredAt: 8320,
  firstRecoveryStart: 8820,
  firstRecoveryEnd: 9540,
  dependencyRecoveredAt: 9540,
  secondRecoveryStart: 10040,
  secondRecoveryEnd: 10840,
  itemRecoveredAt: 10840,
  resetAt: 10840,
} as const;
