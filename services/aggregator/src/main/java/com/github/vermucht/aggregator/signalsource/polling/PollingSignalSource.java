package com.github.vermucht.aggregator.signalsource.polling;

import com.github.vermucht.aggregator.catalog.model.ItemId;
import com.github.vermucht.aggregator.signal.model.HealthSignal;
import jakarta.annotation.Nonnull;
import java.time.Duration;

/** Defines a signal source that can be polled on a fixed interval. */
public interface PollingSignalSource {
  /**
   * Returns the unique identifier for the signal stream.
   *
   * @return signal identifier
   */
  @Nonnull
  String id();

  /**
   * Returns the human-readable signal title.
   *
   * @return signal title
   */
  @Nonnull
  String title();

  /**
   * Returns the catalog item targeted by this signal source.
   *
   * @return catalog item identifier
   */
  @Nonnull
  ItemId itemId();

  /**
   * Returns how often the check should be executed.
   *
   * @return polling interval
   */
  @Nonnull
  Duration getInterval();

  /**
   * Returns the source label for signals emitted by this source.
   *
   * @return source identifier
   */
  @Nonnull
  String source();

  /**
   * Polls the source and returns the observed signal.
   *
   * @return health signal for the source execution
   */
  @Nonnull
  HealthSignal poll();
}
