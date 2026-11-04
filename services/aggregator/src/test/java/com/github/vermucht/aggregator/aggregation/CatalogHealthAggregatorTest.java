package com.github.vermucht.aggregator.aggregation;

import static org.assertj.core.api.Assertions.assertThat;

import com.github.vermucht.aggregator.catalog.model.Catalog;
import com.github.vermucht.aggregator.catalog.model.Dependency;
import com.github.vermucht.aggregator.catalog.model.Item;
import com.github.vermucht.aggregator.catalog.model.ItemId;
import com.github.vermucht.aggregator.signal.model.HealthStatus;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

class CatalogHealthAggregatorTest {
  private final CatalogHealthAggregator aggregator = new CatalogHealthAggregator();

  /** Verifies aggregation reports UP when all included services are UP. */
  @Test
  void aggregatesUpWhenAllIncludedServicesAreUp() {
    Item product = Item.of(ItemId.of("product:payments"), "Payments");
    Item auth = Item.of(ItemId.of("service:auth"), "Auth");
    Item billing = Item.of(ItemId.of("service:billing"), "Billing");
    Catalog catalog =
        new Catalog(
            Map.of(product.getId(), product, auth.getId(), auth, billing.getId(), billing),
            List.of(
                Dependency.of(product.getId(), auth.getId()),
                Dependency.of(product.getId(), billing.getId())));

    Map<ItemId, HealthStatus> serviceStatuses =
        Map.of(
            auth.getId(), HealthStatus.UP,
            billing.getId(), HealthStatus.UP);

    Map<ItemId, HealthStatus> results = aggregator.aggregate(catalog, serviceStatuses);

    assertThat(results).containsEntry(product.getId(), HealthStatus.UP);
  }

  /** Verifies aggregation reports DOWN when any included service is DOWN. */
  @Test
  void aggregatesDownWhenAnyIncludedServiceIsDown() {
    Item product = Item.of(ItemId.of("product:commerce"), "Commerce");
    Item cart = Item.of(ItemId.of("service:cart"), "Cart");
    Item pricing = Item.of(ItemId.of("service:pricing"), "Pricing");
    Catalog catalog =
        new Catalog(
            Map.of(product.getId(), product, cart.getId(), cart, pricing.getId(), pricing),
            List.of(
                Dependency.of(product.getId(), cart.getId()),
                Dependency.of(product.getId(), pricing.getId())));

    Map<ItemId, HealthStatus> serviceStatuses =
        Map.of(
            cart.getId(), HealthStatus.DOWN,
            pricing.getId(), HealthStatus.UP);

    Map<ItemId, HealthStatus> results = aggregator.aggregate(catalog, serviceStatuses);

    assertThat(results).containsEntry(product.getId(), HealthStatus.DOWN);
  }

  /** Verifies aggregation reports UNKNOWN when any included service is UNKNOWN. */
  @Test
  void aggregatesUnknownWhenAnyIncludedServiceIsUnknown() {
    Item product = Item.of(ItemId.of("product:identity"), "Identity");
    Item directory = Item.of(ItemId.of("service:directory"), "Directory");
    Item policy = Item.of(ItemId.of("service:policy"), "Policy");
    Catalog catalog =
        new Catalog(
            Map.of(product.getId(), product, directory.getId(), directory, policy.getId(), policy),
            List.of(
                Dependency.of(product.getId(), directory.getId()),
                Dependency.of(product.getId(), policy.getId())));

    Map<ItemId, HealthStatus> serviceStatuses =
        Map.of(
            directory.getId(), HealthStatus.UP,
            policy.getId(), HealthStatus.UNKNOWN);

    Map<ItemId, HealthStatus> results = aggregator.aggregate(catalog, serviceStatuses);

    assertThat(results).containsEntry(product.getId(), HealthStatus.UNKNOWN);
  }

  /** Verifies aggregation reports UNKNOWN when no dependency has health state data. */
  @Test
  void aggregatesUnknownWhenNotConsideredDependencyType() {
    Item product = Item.of(ItemId.of("product:empty"), "Empty");
    Item service = Item.of(ItemId.of("service:logging"), "Logging");
    Catalog catalog =
        new Catalog(
            Map.of(product.getId(), product, service.getId(), service),
            List.of(Dependency.of(product.getId(), service.getId())));

    Map<ItemId, HealthStatus> results = aggregator.aggregate(catalog, Map.of());

    assertThat(results).containsEntry(product.getId(), HealthStatus.UNKNOWN);
  }

  /** Verifies aggregation treats missing service status as UNKNOWN. */
  @Test
  void treatsMissingServiceStatusAsUnknown() {
    Item product = Item.of(ItemId.of("product:shipping"), "Shipping");
    Item tracking = Item.of(ItemId.of("service:tracking"), "Tracking");
    Catalog catalog =
        new Catalog(
            Map.of(product.getId(), product, tracking.getId(), tracking),
            List.of(Dependency.of(product.getId(), tracking.getId())));

    Map<ItemId, HealthStatus> results = aggregator.aggregate(catalog, Map.of());

    assertThat(results).containsEntry(product.getId(), HealthStatus.UNKNOWN);
  }

  /** Verifies that aggregation works with arbitrary item identifiers. */
  @Test
  void aggregatesAnyItemType() {
    Item parent = Item.of(ItemId.of("aajvkalaseisdadf"), "Payments");
    Item dependency1 = Item.of(ItemId.of("retdsfsdaawsda"), "Auth");
    Item dependency2 = Item.of(ItemId.of("safasfsd"), "Billing");
    Catalog catalog =
        new Catalog(
            Map.of(
                parent.getId(),
                parent,
                dependency1.getId(),
                dependency1,
                dependency2.getId(),
                dependency2),
            List.of(
                Dependency.of(parent.getId(), dependency1.getId()),
                Dependency.of(parent.getId(), dependency1.getId())));

    Map<ItemId, HealthStatus> serviceStatuses =
        Map.of(
            dependency1.getId(), HealthStatus.UP,
            dependency2.getId(), HealthStatus.UP);

    Map<ItemId, HealthStatus> results = aggregator.aggregate(catalog, serviceStatuses);

    assertThat(results).containsEntry(parent.getId(), HealthStatus.UP);
  }
}
