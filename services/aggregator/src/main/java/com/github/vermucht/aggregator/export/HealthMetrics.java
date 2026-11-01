package com.github.vermucht.aggregator.export;

import com.github.vermucht.aggregator.producthealth.ProductHealthQueryService;
import com.github.vermucht.aggregator.producthealth.model.DependencyHealthFact;
import com.github.vermucht.aggregator.producthealth.model.HealthSignalFact;
import com.github.vermucht.aggregator.producthealth.model.ItemHealthFact;
import com.github.vermucht.aggregator.signal.model.HealthStatus;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.MultiGauge;
import io.micrometer.core.instrument.Tags;
import jakarta.annotation.Nonnull;
import jakarta.annotation.PostConstruct;
import java.util.ArrayList;
import java.util.List;
import java.util.Objects;
import org.springframework.stereotype.Component;

/** Registers Prometheus metrics derived from the product health query boundary. */
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

  private final ProductHealthQueryService productHealthQueryService;
  private final MultiGauge itemStateGauge;
  private final MultiGauge itemOwnStateGauge;
  private final MultiGauge itemSignalStateGauge;
  private final MultiGauge dependencyGauge;

  /** Creates and registers item-level health gauges based on canonical health facts. */
  public HealthMetrics(
      @Nonnull MeterRegistry registry,
      @Nonnull ProductHealthQueryService productHealthQueryService) {
    Objects.requireNonNull(registry, "registry");
    this.productHealthQueryService =
        Objects.requireNonNull(productHealthQueryService, "productHealthQueryService");
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

  /** Refreshes dynamic item/signal gauges from the product health query boundary. */
  void refreshDynamicMetrics() {
    List<ItemHealthFact> items = productHealthQueryService.listAllItems();
    List<MultiGauge.Row<?>> itemRows =
        items.stream()
            .<MultiGauge.Row<?>>map(
                item ->
                    MultiGauge.Row.of(
                        Tags.of(LABEL_ITEM_ID, item.itemId(), LABEL_ITEM_NAME, item.title()),
                        item.itemId(),
                        this::itemStateGaugeValue))
            .toList();
    itemStateGauge.register(itemRows, true);

    List<MultiGauge.Row<?>> ownRows =
        items.stream()
            .filter(item -> !item.signals().isEmpty())
            .<MultiGauge.Row<?>>map(
                item ->
                    MultiGauge.Row.of(
                        Tags.of(LABEL_ITEM_ID, item.itemId(), LABEL_ITEM_NAME, item.title()),
                        item.itemId(),
                        this::itemOwnStateGaugeValue))
            .toList();
    itemOwnStateGauge.register(ownRows, true);

    List<MultiGauge.Row<?>> signalRows = new ArrayList<>();
    for (ItemHealthFact item : items) {
      for (HealthSignalFact signal : item.signals()) {
        signalRows.add(
            MultiGauge.Row.of(
                Tags.of(
                    LABEL_ITEM_ID,
                    item.itemId(),
                    LABEL_ITEM_NAME,
                    item.title(),
                    LABEL_SIGNAL_ID,
                    signal.id(),
                    LABEL_SIGNAL_NAME,
                    signal.title(),
                    LABEL_SIGNAL_SOURCE,
                    signal.source()),
                new SignalGaugeRef(item.itemId(), signal.id()),
                this::signalStateGaugeValue));
      }
    }
    itemSignalStateGauge.register(signalRows, true);
    registerDependencyMetrics(items);
  }

  /** Registers dependency edge metrics. */
  private void registerDependencyMetrics(@Nonnull List<ItemHealthFact> items) {
    List<MultiGauge.Row<?>> dependencyRows = new ArrayList<>();
    for (ItemHealthFact item : items) {
      for (DependencyHealthFact dependency : item.dependencies()) {
        dependencyRows.add(
            MultiGauge.Row.of(
                Tags.of(
                    LABEL_SOURCE_ID,
                    item.itemId(),
                    LABEL_TARGET_ID,
                    dependency.itemId(),
                    LABEL_DEP_DEPTH,
                    Integer.toString(dependency.depth())),
                dependency,
                ignored -> 1.0));
      }
    }
    dependencyGauge.register(dependencyRows, true);
  }

  private double itemStateGaugeValue(String itemId) {
    ItemHealthFact item = productHealthQueryService.getItemHealthById(itemId).item();
    return HealthStatusMetrics.toGaugeValue(item == null ? HealthStatus.UNKNOWN : item.state());
  }

  private double itemOwnStateGaugeValue(String itemId) {
    ItemHealthFact item = productHealthQueryService.getItemHealthById(itemId).item();
    return HealthStatusMetrics.toGaugeValue(item == null ? HealthStatus.UNKNOWN : item.ownState());
  }

  private double signalStateGaugeValue(SignalGaugeRef signalRef) {
    ItemHealthFact item = productHealthQueryService.getItemHealthById(signalRef.itemId()).item();
    if (item == null) {
      return HealthStatusMetrics.UNKNOWN_VALUE;
    }
    return item.signals().stream()
        .filter(signal -> signal.id().equals(signalRef.signalId()))
        .findFirst()
        .map(signal -> HealthStatusMetrics.toGaugeValue(signal.state()))
        .orElse(HealthStatusMetrics.UNKNOWN_VALUE);
  }

  private record SignalGaugeRef(String itemId, String signalId) {}
}
