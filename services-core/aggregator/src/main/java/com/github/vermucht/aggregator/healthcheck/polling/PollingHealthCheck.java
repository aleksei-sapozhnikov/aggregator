package com.github.vermucht.aggregator.healthcheck.polling;

import com.github.vermucht.aggregator.catalog.model.ItemId;
import com.github.vermucht.aggregator.healthcheck.model.HealthSignal;
import jakarta.annotation.Nonnull;
import java.time.Duration;

/** Defines a health check that can be polled on a fixed interval. */
public interface PollingHealthCheck {
  /**
   * Returns the unique identifier for the check.
   *
   * @return check identifier
   */
  @Nonnull
  String getCheckId();

  /**
   * Returns the catalog item targeted by this health check.
   *
   * @return catalog item identifier
   */
  @Nonnull
  ItemId getCatalogItemId();

  /**
   * Returns how often the check should be executed.
   *
   * @return polling interval
   */
  @Nonnull
  Duration getInterval();

  /**
   * Returns the source label for signals emitted by this check.
   *
   * @return source identifier
   */
  @Nonnull
  String getSource();

  /**
   * Executes the health check and returns the observed signal.
   *
   * @return health signal for the check execution
   */
  @Nonnull
  HealthSignal poll();
}
