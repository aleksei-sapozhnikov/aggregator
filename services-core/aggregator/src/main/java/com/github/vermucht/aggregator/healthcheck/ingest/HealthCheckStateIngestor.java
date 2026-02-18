package com.github.vermucht.aggregator.healthcheck.ingest;

import com.github.vermucht.aggregator.aggregation.HealthCheckStateStore;
import com.github.vermucht.aggregator.healthcheck.model.HealthSignal;
import jakarta.annotation.Nonnull;
import java.util.Objects;
import org.springframework.stereotype.Component;

/** Ingests health signals by storing the latest state per check. */
@Component
public class HealthCheckStateIngestor implements HealthSignalIngestor {
  private final HealthCheckStateStore store;

  public HealthCheckStateIngestor(@Nonnull HealthCheckStateStore store) {
    this.store = Objects.requireNonNull(store, "store");
  }

  @Override
  public void ingest(@Nonnull HealthSignal signal) {
    store.updateSignal(signal);
  }
}
