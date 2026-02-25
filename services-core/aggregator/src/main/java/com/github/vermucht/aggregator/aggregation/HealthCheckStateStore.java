package com.github.vermucht.aggregator.aggregation;

import com.github.vermucht.aggregator.catalog.model.ItemId;
import com.github.vermucht.aggregator.healthcheck.model.HealthSignal;
import com.github.vermucht.aggregator.healthcheck.model.HealthStatus;
import jakarta.annotation.Nonnull;
import java.util.Collection;
import java.util.Map;
import java.util.Objects;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.stereotype.Component;

/** Stores the latest health status for each catalog item check. */
@Component
public class HealthCheckStateStore {
  private final Map<ItemId, Map<String, HealthStatus>> checkStatuses = new ConcurrentHashMap<>();

  /** Updates the stored health status for a specific check. */
  public void updateSignal(@Nonnull HealthSignal signal) {
    Objects.requireNonNull(signal, "signal");
    checkStatuses
        .computeIfAbsent(signal.catalogItemId(), key -> new ConcurrentHashMap<>())
        .put(signal.checkId(), signal.status());
  }

  /** Returns the last known health status for a specific check. */
  @Nonnull
  public HealthStatus getStatus(@Nonnull ItemId itemId, @Nonnull String checkId) {
    Objects.requireNonNull(itemId, "itemId");
    Objects.requireNonNull(checkId, "checkId");
    return checkStatuses
        .getOrDefault(itemId, Map.of())
        .getOrDefault(checkId, HealthStatus.UNKNOWN);
  }

  /** Aggregates the current item status from the latest statuses of its known checks. */
  @Nonnull
  public HealthStatus getAggregatedItemStatus(@Nonnull ItemId itemId) {
    Objects.requireNonNull(itemId, "itemId");
    Collection<HealthStatus> statuses = checkStatuses.getOrDefault(itemId, Map.of()).values();
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
