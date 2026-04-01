package com.github.vermucht.aggregator.export;

import com.github.vermucht.aggregator.catalog.configuration.CatalogRegistry;
import com.github.vermucht.aggregator.catalog.model.Catalog;
import com.github.vermucht.aggregator.catalog.model.Dependency;
import com.github.vermucht.aggregator.catalog.model.Item;
import com.github.vermucht.aggregator.catalog.model.ItemId;
import com.github.vermucht.aggregator.signal.state.HealthSignalStateStore;
import com.github.vermucht.aggregator.signal.state.ItemHealthStateStore;
import com.github.vermucht.aggregator.signalsource.polling.PollingSignalSource;
import com.github.vermucht.aggregator.signalsource.polling.PollingSignalSourceRegistry;
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
  public static final String LABEL_SIGNAL_ID = "signal_id";
  public static final String LABEL_SIGNAL_NAME = "signal_name";
  public static final String LABEL_SIGNAL_SOURCE = "signal_source";
  public static final String LABEL_SOURCE_ID = "source_id";
  public static final String LABEL_TARGET_ID = "target_id";
  public static final String LABEL_DEP_DEPTH = "dep_depth";

  private final CatalogRegistry catalogRegistry;
  private final ItemHealthStateStore healthStateStore;
  private final HealthSignalStateStore signalStateStore;
  private final PollingSignalSourceRegistry signalSourceRegistry;
  private final MultiGauge itemStateGauge;
  private final MultiGauge itemOwnStateGauge;
  private final MultiGauge itemSignalStateGauge;
  private final MultiGauge dependencyGauge;

  /** Creates and registers item-level health gauges based on the catalog and health state store. */
  public HealthMetrics(
      @Nonnull MeterRegistry registry,
      @Nonnull CatalogRegistry catalogRegistry,
      @Nonnull ItemHealthStateStore healthStateStore,
      @Nonnull HealthSignalStateStore signalStateStore,
      @Nonnull PollingSignalSourceRegistry signalSourceRegistry) {
    Objects.requireNonNull(registry, "registry");
    this.catalogRegistry = Objects.requireNonNull(catalogRegistry, "catalogRegistry");
    this.healthStateStore = Objects.requireNonNull(healthStateStore, "healthStateStore");
    this.signalStateStore = Objects.requireNonNull(signalStateStore, "signalStateStore");
    this.signalSourceRegistry =
        Objects.requireNonNull(signalSourceRegistry, "signalSourceRegistry");
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
    this.dependencyGauge =
        MultiGauge.builder(DEPENDENCY_METRIC_NAME)
            .description("Catalog dependency edge (1=present)")
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
  }

  /** Refreshes dynamic item/signal gauges using the current catalog and signal source snapshot. */
  void refreshDynamicMetrics() {
    Catalog catalog = catalogRegistry.getCatalog();
    List<PollingSignalSource> signalSources = signalSourceRegistry.getSignalSources();
    List<MultiGauge.Row<?>> itemRows =
        catalog.items().values().stream()
            .<MultiGauge.Row<?>>map(
                item ->
                    MultiGauge.Row.of(
                        Tags.of(
                            LABEL_ITEM_ID,
                            item.getId().getValue(),
                            LABEL_ITEM_NAME,
                            item.getTitle()),
                        healthStateStore,
                        store ->
                            HealthStatusMetrics.toGaugeValue(
                                store.getAggregatedStatus(item.getId()))))
            .toList();
    itemStateGauge.register(itemRows, true);

    Map<ItemId, Boolean> itemsWithSignals = new HashMap<>();
    for (PollingSignalSource signalSource : signalSources) {
      itemsWithSignals.put(signalSource.itemId(), Boolean.TRUE);
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
                            item.getTitle()),
                        healthStateStore,
                        store ->
                            HealthStatusMetrics.toGaugeValue(store.getRawStatus(item.getId()))))
            .toList();
    itemOwnStateGauge.register(ownRows, true);

    List<MultiGauge.Row<?>> signalRows = new ArrayList<>(signalSources.size());
    for (PollingSignalSource signalSource : signalSources) {
      ItemId itemId = signalSource.itemId();
      Item item = catalog.items().get(itemId);
      String itemName = item != null ? item.getTitle() : itemId.getValue();
      signalRows.add(
          MultiGauge.Row.of(
              Tags.of(
                  LABEL_ITEM_ID,
                  itemId.getValue(),
                  LABEL_ITEM_NAME,
                  itemName,
                  LABEL_SIGNAL_ID,
                  signalSource.id(),
                  LABEL_SIGNAL_NAME,
                  signalSource.title(),
                  LABEL_SIGNAL_SOURCE,
                  signalSource.source()),
              signalStateStore,
              store ->
                  HealthStatusMetrics.toGaugeValue(store.getStatus(itemId, signalSource.id()))));
    }
    itemSignalStateGauge.register(signalRows, true);
    registerDependencyMetrics(catalog);
  }

  /** Registers dependency edge metrics. */
  private void registerDependencyMetrics(@Nonnull Catalog catalog) {
    Map<ItemId, Map<ItemId, Integer>> dependencyDepths = computeDependencyDepths(catalog);
    List<MultiGauge.Row<?>> dependencyRows = new ArrayList<>();
    for (Map.Entry<ItemId, Map<ItemId, Integer>> sourceEntry : dependencyDepths.entrySet()) {
      ItemId sourceId = sourceEntry.getKey();
      for (Map.Entry<ItemId, Integer> targetEntry : sourceEntry.getValue().entrySet()) {
        ItemId targetId = targetEntry.getKey();
        dependencyRows.add(
            MultiGauge.Row.of(
                Tags.of(
                    LABEL_SOURCE_ID,
                    sourceId.getValue(),
                    LABEL_TARGET_ID,
                    targetId.getValue(),
                    LABEL_DEP_DEPTH,
                    Integer.toString(targetEntry.getValue())),
                this,
                ignored -> 1.0));
      }
    }
    dependencyGauge.register(dependencyRows, true);
  }

  /** Computes the minimal traversal depth between catalog items for all transitive dependencies. */
  private Map<ItemId, Map<ItemId, Integer>> computeDependencyDepths(@Nonnull Catalog catalog) {
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
