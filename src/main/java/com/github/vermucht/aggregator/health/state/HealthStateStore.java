package com.github.vermucht.aggregator.health.state;

import com.github.vermucht.aggregator.catalog.Catalog;
import com.github.vermucht.aggregator.catalog.Item;
import com.github.vermucht.aggregator.catalog.ItemId;
import com.github.vermucht.aggregator.health.aggregation.ProductHealthAggregator;
import com.github.vermucht.aggregator.health.model.HealthStatus;
import jakarta.annotation.Nonnull;
import java.util.Collections;
import java.util.HashMap;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicReference;
import org.springframework.stereotype.Component;

/** Stores the latest computed health state for services and products. */
@Component
public class HealthStateStore {
  private static final Set<String> SERVICE_TYPES = Set.of("service");
  private static final Set<String> PRODUCT_TYPES = Set.of("product");

  private final Catalog catalog;
  private final ProductHealthAggregator productHealthAggregator;
  private final Map<ItemId, HealthStatus> serviceStatuses;
  private final AtomicReference<Map<ItemId, HealthStatus>> productStatuses;

  public HealthStateStore(
      @Nonnull Catalog catalog, @Nonnull ProductHealthAggregator productHealthAggregator) {
    this.catalog = Objects.requireNonNull(catalog, "catalog");
    this.productHealthAggregator =
        Objects.requireNonNull(productHealthAggregator, "productHealthAggregator");
    this.serviceStatuses = new ConcurrentHashMap<>();
    this.productStatuses = new AtomicReference<>(Map.of());
    initializeDefaults();
  }

  /** Updates the stored service health status and recomputes product health. */
  public void updateServiceStatus(@Nonnull ItemId itemId, @Nonnull HealthStatus status) {
    Objects.requireNonNull(itemId, "itemId");
    Objects.requireNonNull(status, "status");
    serviceStatuses.put(itemId, status);
    recomputeProductStatuses();
  }

  /** Returns the current health status for the service item. */
  @Nonnull
  public HealthStatus getServiceStatus(@Nonnull ItemId itemId) {
    Objects.requireNonNull(itemId, "itemId");
    return serviceStatuses.getOrDefault(itemId, HealthStatus.UNKNOWN);
  }

  /** Returns the current health status for the product item. */
  @Nonnull
  public HealthStatus getProductStatus(@Nonnull ItemId itemId) {
    Objects.requireNonNull(itemId, "itemId");
    return productStatuses.get().getOrDefault(itemId, HealthStatus.UNKNOWN);
  }

  /** Returns the aggregated health status for any catalog item. */
  @Nonnull
  public HealthStatus getAggregatedStatus(@Nonnull ItemId itemId) {
    Objects.requireNonNull(itemId, "itemId");
    return productHealthAggregator.getState(itemId, catalog, serviceStatuses);
  }

  private void initializeDefaults() {
    for (Item item : catalog.items().values()) {
      if (isService(item)) {
        serviceStatuses.put(item.getId(), HealthStatus.UNKNOWN);
      }
    }
    recomputeProductStatuses();
  }

  private void recomputeProductStatuses() {
    Map<ItemId, HealthStatus> aggregate =
        new HashMap<>(productHealthAggregator.aggregate(catalog, serviceStatuses));
    Map<ItemId, HealthStatus> productOnly = new HashMap<>();
    for (Item item : catalog.items().values()) {
      if (isProduct(item)) {
        productOnly.put(item.getId(), aggregate.getOrDefault(item.getId(), HealthStatus.UNKNOWN));
      }
    }
    productStatuses.set(Collections.unmodifiableMap(productOnly));
  }

  private boolean isService(Item item) {
    return SERVICE_TYPES.contains(item.getType().toLowerCase());
  }

  private boolean isProduct(Item item) {
    return PRODUCT_TYPES.contains(item.getType().toLowerCase());
  }
}
