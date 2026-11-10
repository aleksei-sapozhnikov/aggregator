package com.github.vermucht.aggregator.signal.ingest;

import com.github.vermucht.aggregator.signal.model.HealthSignal;
import jakarta.annotation.Nonnull;

/** Consumes emitted health signals from signal sources. */
public interface HealthSignalConsumer {
  /**
   * Handles a health signal emitted by a signal source.
   *
   * @param signal signal to ingest
   */
  void ingest(@Nonnull HealthSignal signal);
}
