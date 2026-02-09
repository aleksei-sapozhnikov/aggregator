package com.github.vermucht.aggregator.export;

import static org.assertj.core.api.Assertions.assertThat;

import com.github.vermucht.aggregator.aggregation.HealthStateStore;
import com.github.vermucht.aggregator.aggregation.ProductHealthAggregator;
import com.github.vermucht.aggregator.catalog.model.Catalog;
import com.github.vermucht.aggregator.catalog.model.Dependency;
import com.github.vermucht.aggregator.catalog.model.Item;
import com.github.vermucht.aggregator.catalog.model.ItemId;
import com.github.vermucht.aggregator.healthcheck.model.HealthStatus;
import io.micrometer.core.instrument.Gauge;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import java.util.Collection;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class HealthMetricsTest {

  private SimpleMeterRegistry meterRegistry;
  private HealthStateStore healthStateStore;

  private static Catalog testCatalog() {
    // Create 4 items to match the original expectation (hasSize(4)).
    Item gateway = Item.of(ItemId.of("api-gateway"), "API Gateway", "service");
    Item paymentsApi = Item.of(ItemId.of("payments-api"), "Payments API", "service");
    Item paymentsDb = Item.of(ItemId.of("payments-db"), "Payments DB", "service");
    Item suite = Item.of(ItemId.of("payments-suite"), "Payments Suite", "product");

    // Suite depends on gateway (enough to make product go DOWN when gateway goes DOWN).
    Dependency suiteDependsOnGateway = Dependency.of(suite.getId(), gateway.getId(), "depends_on");

    return new Catalog(
        Map.of(
            gateway.getId(), gateway,
            paymentsApi.getId(), paymentsApi,
            paymentsDb.getId(), paymentsDb,
            suite.getId(), suite),
        List.of(suiteDependsOnGateway));
  }

  @BeforeEach
  void setUp() {
    meterRegistry = new SimpleMeterRegistry();

    Catalog catalog = testCatalog();
    ProductHealthAggregator aggregator = new ProductHealthAggregator();
    healthStateStore = new HealthStateStore(catalog, aggregator);

    // Registers gauges in constructor.
    HealthMetrics metrics = new HealthMetrics(meterRegistry, catalog, healthStateStore);
    metrics.registerMetrics();
  }

  @Test
  void registersMetricsWithExpectedLabels() {
    Collection<Gauge> itemGauges = meterRegistry.find(HealthMetrics.ITEM_METRIC_NAME).gauges();

    assertThat(itemGauges).hasSize(4);

    itemGauges.forEach(
        gauge -> {
          assertThat(gauge.getId().getTag(HealthMetrics.LABEL_ITEM_ID)).isNotBlank();
          assertThat(gauge.getId().getTag(HealthMetrics.LABEL_ITEM_NAME)).isNotBlank();
          assertThat(gauge.getId().getTag(HealthMetrics.LABEL_ITEM_TYPE)).isNotBlank();
        });
  }

  @Test
  void updatesMetricsWhenServiceHealthChanges() {
    Gauge gatewayGauge =
        meterRegistry
            .find(HealthMetrics.ITEM_METRIC_NAME)
            .tags(
                HealthMetrics.LABEL_ITEM_ID, "api-gateway",
                HealthMetrics.LABEL_ITEM_NAME, "API Gateway",
                HealthMetrics.LABEL_ITEM_TYPE, "service")
            .gauge();

    Gauge suiteGauge =
        meterRegistry
            .find(HealthMetrics.ITEM_METRIC_NAME)
            .tags(
                HealthMetrics.LABEL_ITEM_ID, "payments-suite",
                HealthMetrics.LABEL_ITEM_NAME, "Payments Suite",
                HealthMetrics.LABEL_ITEM_TYPE, "product")
            .gauge();

    assertThat(gatewayGauge).isNotNull();
    assertThat(suiteGauge).isNotNull();

    assertThat(gatewayGauge.value()).isEqualTo(HealthStatusMetrics.UNKNOWN_VALUE);
    assertThat(suiteGauge.value()).isEqualTo(HealthStatusMetrics.UNKNOWN_VALUE);

    healthStateStore.updateStatus(ItemId.of("api-gateway"), HealthStatus.DOWN);

    assertThat(gatewayGauge.value()).isEqualTo(HealthStatusMetrics.DOWN_VALUE);
    assertThat(suiteGauge.value()).isEqualTo(HealthStatusMetrics.DOWN_VALUE);
  }
}
