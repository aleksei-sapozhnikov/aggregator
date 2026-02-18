package com.github.vermucht.aggregator.export;

import com.github.vermucht.aggregator.aggregation.HealthCheckStateStore;
import com.github.vermucht.aggregator.aggregation.HealthStateStore;
import com.github.vermucht.aggregator.catalog.model.Catalog;
import com.github.vermucht.aggregator.catalog.model.Dependency;
import com.github.vermucht.aggregator.catalog.model.Item;
import com.github.vermucht.aggregator.catalog.model.ItemId;
import com.github.vermucht.aggregator.healthcheck.polling.PollingHealthCheck;
import io.micrometer.core.instrument.Gauge;
import io.micrometer.core.instrument.MeterRegistry;
import jakarta.annotation.Nonnull;
import jakarta.annotation.PostConstruct;
import java.util.ArrayDeque;
import java.util.Deque;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import org.springframework.stereotype.Component;

/** Registers Prometheus metrics for service and product health state. */
@Component
public class HealthMetrics {
  public static final String ITEM_METRIC_NAME = "catalog_item_state";
  public static final String ITEM_OWN_METRIC_NAME = "catalog_item_own_state";
  public static final String ITEM_CHECK_METRIC_NAME = "catalog_item_check_state";
  public static final String DEPENDENCY_METRIC_NAME = "catalog_dependency";
  public static final String LABEL_ITEM_ID = "item_id";
  public static final String LABEL_ITEM_NAME = "item_name";
  public static final String LABEL_ITEM_TYPE = "item_type";
  public static final String LABEL_CHECK_ID = "check_id";
  public static final String LABEL_CHECK_SOURCE = "check_source";
  public static final String LABEL_SOURCE_ID = "source_id";
  public static final String LABEL_TARGET_ID = "target_id";
  public static final String LABEL_DEP_TYPE = "dep_type";
  public static final String LABEL_DEP_DEPTH = "dep_depth";
  private static final String TRANSITIVE_DEP_TYPE = "transitive";

  private final MeterRegistry registry;
  private final Catalog catalog;
  private final HealthStateStore healthStateStore;
  private final HealthCheckStateStore checkStateStore;
  private final List<PollingHealthCheck> checks;

  /** Creates and registers item-level health gauges based on the catalog and health state store. */
  public HealthMetrics(
      @Nonnull MeterRegistry registry,
      @Nonnull Catalog catalog,
      @Nonnull HealthStateStore healthStateStore,
      @Nonnull HealthCheckStateStore checkStateStore,
      @Nonnull List<PollingHealthCheck> checks) {
    this.registry = Objects.requireNonNull(registry, "registry");
    this.catalog = Objects.requireNonNull(catalog, "catalog");
    this.healthStateStore = Objects.requireNonNull(healthStateStore, "healthStateStore");
    this.checkStateStore = Objects.requireNonNull(checkStateStore, "checkStateStore");
    this.checks = List.copyOf(Objects.requireNonNull(checks, "checks"));

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
      Gauge.builder(
              ITEM_OWN_METRIC_NAME,
              healthStateStore,
              store -> HealthStatusMetrics.toGaugeValue(store.getRawStatus(itemId)))
          .description("Raw health from item health checks (1=UP, 0.5=UNKNOWN, 0=DOWN)")
          .tag(LABEL_ITEM_ID, itemId.getValue())
          .tag(LABEL_ITEM_NAME, item.getName())
          .tag(LABEL_ITEM_TYPE, item.getType())
          .register(registry);
    }

    registerCheckMetrics();
    registerDependencyMetrics();
  }

  /** Initializes metric registration after Spring context construction. */
  @PostConstruct
  void init() {
    registerMetrics();
  }

  /** Registers all item and dependency metrics in the meter registry. */
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
      Gauge.builder(
              ITEM_OWN_METRIC_NAME,
              healthStateStore,
              store -> HealthStatusMetrics.toGaugeValue(store.getRawStatus(itemId)))
          .description("Raw health from item health checks (1=UP, 0.5=UNKNOWN, 0=DOWN)")
          .tag(LABEL_ITEM_ID, itemId.getValue())
          .tag(LABEL_ITEM_NAME, item.getName())
          .tag(LABEL_ITEM_TYPE, item.getType())
          .register(registry);
    }

    registerCheckMetrics();
    registerDependencyMetrics();
  }

  /** Registers health check-level metrics. */
  private void registerCheckMetrics() {
    for (PollingHealthCheck check : checks) {
      ItemId itemId = check.getCatalogItemId();
      Item item = catalog.items().get(itemId);
      String itemName = item != null ? item.getName() : itemId.getValue();
      String itemType = item != null ? item.getType() : "unknown";

      Gauge.builder(
              ITEM_CHECK_METRIC_NAME,
              checkStateStore,
              store -> HealthStatusMetrics.toGaugeValue(store.getStatus(itemId, check.getCheckId())))
          .description("Health status for a specific check (1=UP, 0.5=UNKNOWN, 0=DOWN)")
          .tag(LABEL_ITEM_ID, itemId.getValue())
          .tag(LABEL_ITEM_NAME, itemName)
          .tag(LABEL_ITEM_TYPE, itemType)
          .tag(LABEL_CHECK_ID, check.getCheckId())
          .tag(LABEL_CHECK_SOURCE, check.getSource())
          .register(registry);
    }
  }

  /** Registers dependency edge metrics. */
  private void registerDependencyMetrics() {
    Map<ItemId, Map<ItemId, String>> directTypes = new HashMap<>();
    for (Dependency dependency : catalog.dependencies()) {
      directTypes
          .computeIfAbsent(dependency.getSourceId(), key -> new HashMap<>())
          .put(dependency.getTargetId(), dependency.getType());
    }

    Map<ItemId, Map<ItemId, Integer>> dependencyDepths = computeDependencyDepths();
    for (Map.Entry<ItemId, Map<ItemId, Integer>> sourceEntry : dependencyDepths.entrySet()) {
      ItemId sourceId = sourceEntry.getKey();
      Map<ItemId, String> sourceTypes = directTypes.getOrDefault(sourceId, Map.of());
      for (Map.Entry<ItemId, Integer> targetEntry : sourceEntry.getValue().entrySet()) {
        ItemId targetId = targetEntry.getKey();
        String depType = sourceTypes.getOrDefault(targetId, TRANSITIVE_DEP_TYPE);
        Gauge.builder(DEPENDENCY_METRIC_NAME, () -> 1.0)
            .description("Catalog dependency edge (1=present)")
            .tag(LABEL_SOURCE_ID, sourceId.getValue())
            .tag(LABEL_TARGET_ID, targetId.getValue())
            .tag(LABEL_DEP_TYPE, depType)
            .tag(LABEL_DEP_DEPTH, Integer.toString(targetEntry.getValue()))
            .register(registry);
      }
    }
  }

  /** Computes the minimal traversal depth between catalog items for all transitive dependencies. */
  private Map<ItemId, Map<ItemId, Integer>> computeDependencyDepths() {
    Map<ItemId, List<ItemId>> adjacency = new HashMap<>();
    for (Dependency dependency : catalog.dependencies()) {
      adjacency
          .computeIfAbsent(dependency.getSourceId(), key -> new java.util.ArrayList<>())
          .add(dependency.getTargetId());
    }

    Map<ItemId, Map<ItemId, Integer>> result = new HashMap<>();
    for (ItemId sourceId : adjacency.keySet()) {
      Map<ItemId, Integer> depths = new HashMap<>();
      Deque<DependencyTraversal> queue = new ArrayDeque<>();
      for (ItemId directTarget : adjacency.getOrDefault(sourceId, List.of())) {
        if (depths.putIfAbsent(directTarget, 1) == null) {
          queue.add(new DependencyTraversal(directTarget, 1));
        }
      }

      while (!queue.isEmpty()) {
        DependencyTraversal current = queue.removeFirst();
        int nextDepth = current.depth() + 1;
        for (ItemId nextTarget : adjacency.getOrDefault(current.targetId(), List.of())) {
          Integer existingDepth = depths.get(nextTarget);
          if (existingDepth == null || nextDepth < existingDepth) {
            depths.put(nextTarget, nextDepth);
            queue.add(new DependencyTraversal(nextTarget, nextDepth));
          }
        }
      }

      if (!depths.isEmpty()) {
        result.put(sourceId, depths);
      }
    }
    return result;
  }

  /** Represents a traversal step during dependency graph breadth-first search. */
  private record DependencyTraversal(ItemId targetId, int depth) {}
}
