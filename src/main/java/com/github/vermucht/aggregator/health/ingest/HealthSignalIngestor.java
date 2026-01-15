package com.github.vermucht.aggregator.health.ingest;

import com.github.vermucht.aggregator.health.model.HealthSignal;
import jakarta.annotation.Nonnull;

/** Consumes emitted health signals from polling checks. */
public interface HealthSignalIngestor {
  /**
   * Handles a health signal emitted by a polling check.
   *
   * @param signal signal to ingest
   */
  void ingest(@Nonnull HealthSignal signal);
}
