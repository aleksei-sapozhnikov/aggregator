package com.github.vermucht.aggregator.signal.state;

import com.github.vermucht.aggregator.aggregation.CatalogHealthAggregator;
import com.github.vermucht.aggregator.catalog.configuration.CatalogRegistry;
import com.github.vermucht.aggregator.catalog.model.ItemId;
import com.github.vermucht.aggregator.signal.model.HealthStatus;
import jakarta.annotation.Nonnull;
import java.util.Map;
import java.util.Objects;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.stereotype.Component;

/** Stores the latest raw health signals and provides aggregated health for catalog items. */
@Component
public class ItemHealthStateStore {

  private final CatalogRegistry catalogRegistry;
  private final CatalogHealthAggregator catalogHealthAggregator;

  /**
   * Raw (ingested) health status per item. Aggregation is computed on demand via the catalog graph.
   */
  private final Map<ItemId, HealthStatus> rawStatuses;

  public ItemHealthStateStore(
      @Nonnull CatalogRegistry catalogRegistry,
      @Nonnull CatalogHealthAggregator catalogHealthAggregator) {
    this.catalogRegistry = Objects.requireNonNull(catalogRegistry, "catalogRegistry");
    this.catalogHealthAggregator =
        Objects.requireNonNull(catalogHealthAggregator, "catalogHealthAggregator");
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
    initializeDefaults();
    return catalogHealthAggregator.getState(itemId, catalogRegistry.getCatalog(), rawStatuses);
  }

  private void initializeDefaults() {
    for (ItemId itemId : catalogRegistry.getCatalog().items().keySet()) {
      rawStatuses.putIfAbsent(itemId, HealthStatus.UNKNOWN);
    }
  }
}
