package com.github.vermucht.aggregator.health.state;

import com.github.vermucht.aggregator.catalog.Catalog;
import com.github.vermucht.aggregator.catalog.ItemId;
import com.github.vermucht.aggregator.health.aggregation.ProductHealthAggregator;
import com.github.vermucht.aggregator.health.model.HealthStatus;
import jakarta.annotation.Nonnull;
import java.util.Map;
import java.util.Objects;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.stereotype.Component;

/** Stores the latest raw health signals and provides aggregated health for catalog items. */
@Component
public class HealthStateStore {

  private final Catalog catalog;
  private final ProductHealthAggregator productHealthAggregator;

  /**
   * Raw (ingested) health status per item. Aggregation is computed on demand via the catalog graph.
   */
  private final Map<ItemId, HealthStatus> rawStatuses;

  public HealthStateStore(
      @Nonnull Catalog catalog, @Nonnull ProductHealthAggregator productHealthAggregator) {
    this.catalog = Objects.requireNonNull(catalog, "catalog");
    this.productHealthAggregator =
        Objects.requireNonNull(productHealthAggregator, "productHealthAggregator");
    this.rawStatuses = new ConcurrentHashMap<>();
    initializeDefaults();
  }

  /** Updates the stored raw health status for an item. */
  public void updateStatus(@Nonnull ItemId itemId, @Nonnull HealthStatus status) {
    Objects.requireNonNull(itemId, "itemId");
    Objects.requireNonNull(status, "status");
    rawStatuses.put(itemId, status);
  }

  /** Returns the last known raw health status for an item (no aggregation). */
  @Nonnull
  public HealthStatus getRawStatus(@Nonnull ItemId itemId) {
    Objects.requireNonNull(itemId, "itemId");
    return rawStatuses.getOrDefault(itemId, HealthStatus.UNKNOWN);
  }

  /** Returns the aggregated health status for an item based on catalog dependencies. */
  @Nonnull
  public HealthStatus getAggregatedStatus(@Nonnull ItemId itemId) {
    Objects.requireNonNull(itemId, "itemId");
    return productHealthAggregator.getState(itemId, catalog, rawStatuses);
  }

  private void initializeDefaults() {
    for (ItemId itemId : catalog.items().keySet()) {
      rawStatuses.putIfAbsent(itemId, HealthStatus.UNKNOWN);
    }
  }
}
