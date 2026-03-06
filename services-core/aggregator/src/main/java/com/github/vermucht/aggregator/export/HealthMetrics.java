package com.github.vermucht.aggregator.export;

import com.github.vermucht.aggregator.catalog.model.Catalog;
import com.github.vermucht.aggregator.catalog.model.Dependency;
import com.github.vermucht.aggregator.catalog.model.Item;
import com.github.vermucht.aggregator.catalog.model.ItemId;
import com.github.vermucht.aggregator.signal.state.HealthSignalStateStore;
import com.github.vermucht.aggregator.signal.state.ItemHealthStateStore;
import com.github.vermucht.aggregator.signalsource.polling.PollingSignalSource;
import io.micrometer.core.instrument.Gauge;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.MultiGauge;
import io.micrometer.core.instrument.Tags;
import jakarta.annotation.Nonnull;
import jakarta.annotation.PostConstruct;
import java.util.ArrayDeque;
import java.util.ArrayList;
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
  public static final String ITEM_SIGNAL_METRIC_NAME = "catalog_item_signal_state";
  public static final String DEPENDENCY_METRIC_NAME = "catalog_dependency";
  public static final String LABEL_ITEM_ID = "item_id";
  public static final String LABEL_ITEM_NAME = "item_name";
  public static final String LABEL_ITEM_TYPE = "item_type";
  public static final String LABEL_SIGNAL_ID = "signal_id";
  public static final String LABEL_SIGNAL_NAME = "signal_name";
  public static final String LABEL_SIGNAL_SOURCE = "signal_source";
  public static final String LABEL_SOURCE_ID = "source_id";
  public static final String LABEL_TARGET_ID = "target_id";
  public static final String LABEL_DEP_TYPE = "dep_type";
  public static final String LABEL_DEP_DEPTH = "dep_depth";
  private static final String TRANSITIVE_DEP_TYPE = "transitive";

  private final MeterRegistry registry;
  private final Catalog catalog;
  private final ItemHealthStateStore healthStateStore;
  private final HealthSignalStateStore signalStateStore;
  private final List<PollingSignalSource> signalSources;
  private final MultiGauge itemStateGauge;
  private final MultiGauge itemOwnStateGauge;
  private final MultiGauge itemSignalStateGauge;
  private boolean dependencyMetricsRegistered;

  /** Creates and registers item-level health gauges based on the catalog and health state store. */
  public HealthMetrics(
      @Nonnull MeterRegistry registry,
      @Nonnull Catalog catalog,
      @Nonnull ItemHealthStateStore healthStateStore,
      @Nonnull HealthSignalStateStore signalStateStore,
      @Nonnull List<PollingSignalSource> signalSources) {
    this.registry = Objects.requireNonNull(registry, "registry");
    this.catalog = Objects.requireNonNull(catalog, "catalog");
    this.healthStateStore = Objects.requireNonNull(healthStateStore, "healthStateStore");
    this.signalStateStore = Objects.requireNonNull(signalStateStore, "signalStateStore");
    this.signalSources = List.copyOf(Objects.requireNonNull(signalSources, "signalSources"));
    this.itemStateGauge =
        MultiGauge.builder(ITEM_METRIC_NAME)
            .description("Current health of a catalog item (1=UP, 0.5=UNKNOWN, 0=DOWN)")
            .register(registry);
    this.itemOwnStateGauge =
        MultiGauge.builder(ITEM_OWN_METRIC_NAME)
            .description("Raw health from item health signals (1=UP, 0.5=UNKNOWN, 0=DOWN)")
            .register(registry);
    this.itemSignalStateGauge =
        MultiGauge.builder(ITEM_SIGNAL_METRIC_NAME)
            .description("Health status for a specific signal (1=UP, 0.5=UNKNOWN, 0=DOWN)")
            .register(registry);
  }

  /** Initializes metric registration after Spring context construction. */
  @PostConstruct
  void init() {
    registerMetrics();
  }

  /** Registers all item and dependency metrics in the meter registry. */
  void registerMetrics() {
    refreshDynamicMetrics();
    if (!dependencyMetricsRegistered) {
      registerDependencyMetrics();
      dependencyMetricsRegistered = true;
    }
  }

  /** Refreshes dynamic item/signal gauges using the current catalog and signal source snapshot. */
  void refreshDynamicMetrics() {
    List<MultiGauge.Row<?>> itemRows =
        catalog.items().values().stream()
            .<MultiGauge.Row<?>>map(
                item ->
                    MultiGauge.Row.of(
                        Tags.of(
                            LABEL_ITEM_ID,
                            item.getId().getValue(),
                            LABEL_ITEM_NAME,
                            item.getName(),
                            LABEL_ITEM_TYPE,
                            item.getType()),
                        healthStateStore,
                        store ->
                            HealthStatusMetrics.toGaugeValue(
                                store.getAggregatedStatus(item.getId()))))
            .toList();
    itemStateGauge.register(itemRows, true);

    Map<ItemId, Boolean> itemsWithSignals = new HashMap<>();
    for (PollingSignalSource signalSource : signalSources) {
      itemsWithSignals.put(signalSource.getCatalogItemId(), Boolean.TRUE);
    }
    List<MultiGauge.Row<?>> ownRows =
        catalog.items().values().stream()
            .filter(item -> itemsWithSignals.containsKey(item.getId()))
            .<MultiGauge.Row<?>>map(
                item ->
                    MultiGauge.Row.of(
                        Tags.of(
                            LABEL_ITEM_ID,
                            item.getId().getValue(),
                            LABEL_ITEM_NAME,
                            item.getName(),
                            LABEL_ITEM_TYPE,
                            item.getType()),
                        healthStateStore,
                        store ->
                            HealthStatusMetrics.toGaugeValue(store.getRawStatus(item.getId()))))
            .toList();
    itemOwnStateGauge.register(ownRows, true);

    List<MultiGauge.Row<?>> signalRows = new ArrayList<>(signalSources.size());
    for (PollingSignalSource signalSource : signalSources) {
      ItemId itemId = signalSource.getCatalogItemId();
      Item item = catalog.items().get(itemId);
      String itemName = item != null ? item.getName() : itemId.getValue();
      String itemType = item != null ? item.getType() : "unknown";
      signalRows.add(
          MultiGauge.Row.of(
              Tags.of(
                  LABEL_ITEM_ID,
                  itemId.getValue(),
                  LABEL_ITEM_NAME,
                  itemName,
                  LABEL_ITEM_TYPE,
                  itemType,
                  LABEL_SIGNAL_ID,
                  signalSource.signalId(),
                  LABEL_SIGNAL_NAME,
                  signalSource.name(),
                  LABEL_SIGNAL_SOURCE,
                  signalSource.source()),
              signalStateStore,
              store ->
                  HealthStatusMetrics.toGaugeValue(
                      store.getStatus(itemId, signalSource.signalId()))));
    }
    itemSignalStateGauge.register(signalRows, true);
  }

  /** Registers dependency edge metrics. */
  private void registerDependencyMetrics() {
    Map<ItemId, Map<ItemId, String>> directTypes = new HashMap<>();
    for (Dependency dependency : catalog.dependencies()) {
      directTypes
          .computeIfAbsent(dependency.getSourceId(), _ -> new HashMap<>())
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
          .computeIfAbsent(dependency.getSourceId(), _ -> new ArrayList<>())
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
