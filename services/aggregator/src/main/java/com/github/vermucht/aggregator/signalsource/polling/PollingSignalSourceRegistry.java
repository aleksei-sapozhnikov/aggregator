package com.github.vermucht.aggregator.signalsource.polling;

import jakarta.annotation.Nonnull;
import java.util.List;
import java.util.Objects;
import java.util.concurrent.atomic.AtomicReference;
import org.springframework.stereotype.Component;

/** Holds the current polling signal source snapshot for future runtime reconfiguration. */
@Component
public class PollingSignalSourceRegistry {
  private final AtomicReference<List<PollingSignalSource>> currentSignalSources;

  public PollingSignalSourceRegistry(@Nonnull List<PollingSignalSource> initialSignalSources) {
    Objects.requireNonNull(initialSignalSources, "initialSignalSources");
    this.currentSignalSources = new AtomicReference<>(List.copyOf(initialSignalSources));
  }

  @Nonnull
  public List<PollingSignalSource> getSignalSources() {
    return currentSignalSources.get();
  }

  public void replaceSignalSources(@Nonnull List<PollingSignalSource> updatedSignalSources) {
    Objects.requireNonNull(updatedSignalSources, "updatedSignalSources");
    currentSignalSources.set(List.copyOf(updatedSignalSources));
  }
}
