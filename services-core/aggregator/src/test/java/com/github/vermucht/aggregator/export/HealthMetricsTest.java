package com.github.vermucht.aggregator.export;

import static org.assertj.core.api.Assertions.assertThat;

import com.github.vermucht.aggregator.aggregation.HealthStateStore;
import com.github.vermucht.aggregator.aggregation.ProductHealthAggregator;
import com.github.vermucht.aggregator.aggregation.HealthCheckStateStore;
import com.github.vermucht.aggregator.catalog.model.Catalog;
import com.github.vermucht.aggregator.catalog.model.Dependency;
import com.github.vermucht.aggregator.catalog.model.Item;
import com.github.vermucht.aggregator.catalog.model.ItemId;
import com.github.vermucht.aggregator.healthcheck.model.HealthStatus;
import com.github.vermucht.aggregator.healthcheck.model.HealthSignal;
import com.github.vermucht.aggregator.healthcheck.polling.PollingHealthCheck;
import io.micrometer.core.instrument.Gauge;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import java.util.Collection;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class HealthMetricsTest {

  private SimpleMeterRegistry meterRegistry;
  private HealthStateStore healthStateStore;
  private HealthCheckStateStore checkStateStore;

  private static Catalog testCatalog() {
    // Create 4 items to match the expected gauge count.
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
    checkStateStore = new HealthCheckStateStore();

    // Registers gauges in constructor.
    HealthMetrics metrics =
        new HealthMetrics(
            meterRegistry,
            catalog,
            healthStateStore,
            checkStateStore,
            List.of(
                new StubHealthCheck(
                    ItemId.of("api-gateway"),
                    "gateway-health",
                    "Gateway readiness",
                    "http")));
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

  @Test
  void updatesOwnMetricWithRawHealthStatus() {
    Gauge gatewayOwnGauge =
        meterRegistry
            .find(HealthMetrics.ITEM_OWN_METRIC_NAME)
            .tags(
                HealthMetrics.LABEL_ITEM_ID, "api-gateway",
                HealthMetrics.LABEL_ITEM_NAME, "API Gateway",
                HealthMetrics.LABEL_ITEM_TYPE, "service")
            .gauge();

    Gauge suiteOwnGauge =
        meterRegistry
            .find(HealthMetrics.ITEM_OWN_METRIC_NAME)
            .tags(
                HealthMetrics.LABEL_ITEM_ID, "payments-suite",
                HealthMetrics.LABEL_ITEM_NAME, "Payments Suite",
                HealthMetrics.LABEL_ITEM_TYPE, "product")
            .gauge();

    assertThat(gatewayOwnGauge).isNotNull();
    assertThat(suiteOwnGauge).isNotNull();

    assertThat(gatewayOwnGauge.value()).isEqualTo(HealthStatusMetrics.UNKNOWN_VALUE);
    assertThat(suiteOwnGauge.value()).isEqualTo(HealthStatusMetrics.UNKNOWN_VALUE);

    healthStateStore.updateStatus(ItemId.of("payments-suite"), HealthStatus.DOWN);

    assertThat(suiteOwnGauge.value()).isEqualTo(HealthStatusMetrics.DOWN_VALUE);
  }

  @Test
  void updatesCheckMetricWithLatestSignal() {
    Gauge checkGauge =
        meterRegistry
            .find(HealthMetrics.ITEM_CHECK_METRIC_NAME)
            .tags(
                HealthMetrics.LABEL_ITEM_ID, "api-gateway",
                HealthMetrics.LABEL_ITEM_NAME, "API Gateway",
                HealthMetrics.LABEL_ITEM_TYPE, "service",
                HealthMetrics.LABEL_CHECK_ID, "gateway-health",
                HealthMetrics.LABEL_CHECK_NAME, "Gateway readiness",
                HealthMetrics.LABEL_CHECK_SOURCE, "http")
            .gauge();

    assertThat(checkGauge).isNotNull();
    assertThat(checkGauge.value()).isEqualTo(HealthStatusMetrics.UNKNOWN_VALUE);

    checkStateStore.updateSignal(
        new HealthSignal(
            ItemId.of("api-gateway"),
            "gateway-health",
            HealthStatus.DOWN,
            Instant.now(),
            "http",
            null,
            Map.of()));

    assertThat(checkGauge.value()).isEqualTo(HealthStatusMetrics.DOWN_VALUE);
  }

  private static final class StubHealthCheck implements PollingHealthCheck {
    private final ItemId itemId;
    private final String checkId;
    private final String name;
    private final String source;

    private StubHealthCheck(ItemId itemId, String checkId, String name, String source) {
      this.itemId = itemId;
      this.checkId = checkId;
      this.name = name;
      this.source = source;
    }

    @Override
    public String getCheckId() {
      return checkId;
    }

    @Override
    public String getName() {
      return name;
    }

    @Override
    public ItemId getCatalogItemId() {
      return itemId;
    }

    @Override
    public Duration getInterval() {
      return Duration.ofSeconds(30);
    }

    @Override
    public String getSource() {
      return source;
    }

    @Override
    public HealthSignal poll() {
      return new HealthSignal(
          itemId, checkId, HealthStatus.UP, Instant.now(), source, null, Map.of());
    }
  }
}
