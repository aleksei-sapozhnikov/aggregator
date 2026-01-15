package com.github.vermucht.aggregator.health.metrics;

import com.github.vermucht.aggregator.catalog.Catalog;
import com.github.vermucht.aggregator.catalog.Item;
import com.github.vermucht.aggregator.catalog.ItemId;
import com.github.vermucht.aggregator.health.state.HealthStateStore;
import io.micrometer.core.instrument.Gauge;
import io.micrometer.core.instrument.MeterRegistry;
import jakarta.annotation.Nonnull;
import jakarta.annotation.PostConstruct;
import java.util.Objects;
import org.springframework.stereotype.Component;

/** Registers Prometheus metrics for service and product health state. */
@Component
public class HealthMetrics {
  public static final String ITEM_METRIC_NAME = "catalog_item_state";
  public static final String LABEL_ITEM_ID = "item_id";
  public static final String LABEL_ITEM_NAME = "item_name";
  public static final String LABEL_ITEM_TYPE = "item_type";

  private final MeterRegistry registry;
  private final Catalog catalog;
  private final HealthStateStore healthStateStore;

  public HealthMetrics(
      @Nonnull MeterRegistry registry,
      @Nonnull Catalog catalog,
      @Nonnull HealthStateStore healthStateStore) {
    this.registry = Objects.requireNonNull(registry, "registry");
    this.catalog = Objects.requireNonNull(catalog, "catalog");
    this.healthStateStore = Objects.requireNonNull(healthStateStore, "healthStateStore");

    for (Item item : catalog.items().values()) {
      ItemId itemId = item.getId();
      Gauge.builder(
              ITEM_METRIC_NAME,
              healthStateStore,
              store -> HealthStatusMetrics.toGaugeValue(store.getAggregatedStatus(itemId)))
          .description("Current health of a catalog item (1=UP, 0.5=UNKNOWN, 0=DOWN)")
          .tag(LABEL_ITEM_ID, itemId.getValue())
          .tag(LABEL_ITEM_NAME, item.getName())
          .tag(LABEL_ITEM_TYPE, item.getType())
          .register(registry);
    }
  }

  @PostConstruct
  void init() {
    registerMetrics();
  }

  void registerMetrics() {
    for (Item item : catalog.items().values()) {
      ItemId itemId = item.getId();
      Gauge.builder(
              ITEM_METRIC_NAME,
              healthStateStore,
              store -> HealthStatusMetrics.toGaugeValue(store.getAggregatedStatus(itemId)))
          .description("Current health of a catalog item (1=UP, 0.5=UNKNOWN, 0=DOWN)")
          .tag(LABEL_ITEM_ID, itemId.getValue())
          .tag(LABEL_ITEM_NAME, item.getName())
          .tag(LABEL_ITEM_TYPE, item.getType())
          .register(registry);
    }
  }
}
