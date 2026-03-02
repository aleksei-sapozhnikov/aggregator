package com.github.vermucht.aggregator.signal.ingest;

import com.github.vermucht.aggregator.signal.model.HealthSignal;
import com.github.vermucht.aggregator.signal.state.HealthSignalStateStore;
import jakarta.annotation.Nonnull;
import java.util.Objects;
import org.springframework.stereotype.Component;

/** Consumes health signals by storing the latest state per signal. */
@Component
public class HealthSignalStateConsumer implements HealthSignalConsumer {
  private final HealthSignalStateStore store;

  public HealthSignalStateConsumer(@Nonnull HealthSignalStateStore store) {
    this.store = Objects.requireNonNull(store, "store");
  }

  @Override
  public void ingest(@Nonnull HealthSignal signal) {
    store.updateSignal(signal);
  }
}
