package com.github.vermucht.aggregator.signal.state;

import com.github.vermucht.aggregator.catalog.model.ItemId;
import com.github.vermucht.aggregator.signal.model.HealthSignal;
import com.github.vermucht.aggregator.signal.model.HealthStatus;
import jakarta.annotation.Nonnull;
import java.util.Collection;
import java.util.Map;
import java.util.Objects;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.stereotype.Component;

/** Stores the latest health status for each catalog item signal. */
@Component
public class HealthSignalStateStore {
  private final Map<ItemId, Map<String, HealthStatus>> signalStatuses = new ConcurrentHashMap<>();

  /** Updates the stored health status for a specific signal. */
  public void updateSignal(@Nonnull HealthSignal signal) {
    Objects.requireNonNull(signal, "signal");
    signalStatuses
        .computeIfAbsent(signal.itemId(), key -> new ConcurrentHashMap<>())
        .put(signal.id(), signal.status());
  }

  /** Returns the last known health status for a specific signal. */
  @Nonnull
  public HealthStatus getStatus(@Nonnull ItemId itemId, @Nonnull String id) {
    Objects.requireNonNull(itemId, "itemId");
    Objects.requireNonNull(id, "id");
    return signalStatuses.getOrDefault(itemId, Map.of()).getOrDefault(id, HealthStatus.UNKNOWN);
  }

  /** Aggregates the current item status from the latest statuses of its known signals. */
  @Nonnull
  public HealthStatus getAggregatedItemStatus(@Nonnull ItemId itemId) {
    Objects.requireNonNull(itemId, "itemId");
    Collection<HealthStatus> statuses = signalStatuses.getOrDefault(itemId, Map.of()).values();
    if (statuses.isEmpty()) {
      return HealthStatus.UNKNOWN;
    }
    if (statuses.contains(HealthStatus.DOWN)) {
      return HealthStatus.DOWN;
    }
    if (statuses.contains(HealthStatus.UNKNOWN)) {
      return HealthStatus.UNKNOWN;
    }
    return HealthStatus.UP;
  }
}
