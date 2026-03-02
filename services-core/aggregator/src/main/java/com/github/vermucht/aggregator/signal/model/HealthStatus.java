package com.github.vermucht.aggregator.signal.model;

/** Enumerates possible health signal outcomes. */
public enum HealthStatus {
  /** Signal indicates the target is healthy. */
  UP,
  /** Signal indicates the target is unhealthy. */
  DOWN,
  /** Signal result is unknown or indeterminate. */
  UNKNOWN
}
