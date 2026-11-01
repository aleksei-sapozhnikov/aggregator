package com.github.vermucht.aggregator.export;

import com.github.vermucht.aggregator.signal.model.HealthStatus;
import jakarta.annotation.Nonnull;

/** Maps health status values to numeric metric representations. */
public final class HealthStatusMetrics {
  public static final double DOWN_VALUE = 0.0;
  public static final double UNKNOWN_VALUE = 0.5;
  public static final double UP_VALUE = 1.0;

  private HealthStatusMetrics() {}

  /**
   * Converts the provided health status into a numeric gauge value.
   *
   * @param status health status to convert
   * @return numeric value representing the status
   */
  public static double toGaugeValue(@Nonnull HealthStatus status) {
    return switch (status) {
      case UP -> UP_VALUE;
      case DOWN -> DOWN_VALUE;
      case UNKNOWN -> UNKNOWN_VALUE;
    };
  }
}
