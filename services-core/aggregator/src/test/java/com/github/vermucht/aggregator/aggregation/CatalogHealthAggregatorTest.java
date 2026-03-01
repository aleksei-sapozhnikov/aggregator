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
    Item product = Item.of(ItemId.of("product:payments"), "Payments", "product");
    Item auth = Item.of(ItemId.of("service:auth"), "Auth", "service");
    Item billing = Item.of(ItemId.of("service:billing"), "Billing", "service");
    Catalog catalog =
        new Catalog(
            Map.of(product.getId(), product, auth.getId(), auth, billing.getId(), billing),
            List.of(
                Dependency.of(product.getId(), auth.getId(), "includes"),
                Dependency.of(product.getId(), billing.getId(), "depends_on")));

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
    Item product = Item.of(ItemId.of("product:commerce"), "Commerce", "product");
    Item cart = Item.of(ItemId.of("service:cart"), "Cart", "service");
    Item pricing = Item.of(ItemId.of("service:pricing"), "Pricing", "service");
    Catalog catalog =
        new Catalog(
            Map.of(product.getId(), product, cart.getId(), cart, pricing.getId(), pricing),
            List.of(
                Dependency.of(product.getId(), cart.getId(), "depends_on"),
                Dependency.of(product.getId(), pricing.getId(), "includes")));

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
    Item product = Item.of(ItemId.of("product:identity"), "Identity", "product");
    Item directory = Item.of(ItemId.of("service:directory"), "Directory", "service");
    Item policy = Item.of(ItemId.of("service:policy"), "Policy", "service");
    Catalog catalog =
        new Catalog(
            Map.of(product.getId(), product, directory.getId(), directory, policy.getId(), policy),
            List.of(
                Dependency.of(product.getId(), directory.getId(), "depends_on"),
                Dependency.of(product.getId(), policy.getId(), "includes")));

    Map<ItemId, HealthStatus> serviceStatuses =
        Map.of(
            directory.getId(), HealthStatus.UP,
            policy.getId(), HealthStatus.UNKNOWN);

    Map<ItemId, HealthStatus> results = aggregator.aggregate(catalog, serviceStatuses);

    assertThat(results).containsEntry(product.getId(), HealthStatus.UNKNOWN);
  }

  /**
   * Verifies aggregation reports UNKNOWN when a product has no services with considered dependency
   * types.
   */
  @Test
  void aggregatesUnknownWhenNotConsideredDependencyType() {
    Item product = Item.of(ItemId.of("product:empty"), "Empty", "product");
    Item service = Item.of(ItemId.of("service:logging"), "Logging", "service");
    Catalog catalog =
        new Catalog(
            Map.of(product.getId(), product, service.getId(), service),
            List.of(Dependency.of(product.getId(), service.getId(), "relates_to")));

    Map<ItemId, HealthStatus> results = aggregator.aggregate(catalog, Map.of());

    assertThat(results).containsEntry(product.getId(), HealthStatus.UNKNOWN);
  }

  /** Verifies aggregation treats missing service status as UNKNOWN. */
  @Test
  void treatsMissingServiceStatusAsUnknown() {
    Item product = Item.of(ItemId.of("product:shipping"), "Shipping", "product");
    Item tracking = Item.of(ItemId.of("service:tracking"), "Tracking", "service");
    Catalog catalog =
        new Catalog(
            Map.of(product.getId(), product, tracking.getId(), tracking),
            List.of(Dependency.of(product.getId(), tracking.getId(), "depends_on")));

    Map<ItemId, HealthStatus> results = aggregator.aggregate(catalog, Map.of());

    assertThat(results).containsEntry(product.getId(), HealthStatus.UNKNOWN);
  }

  /** Verifies that aggregation is not limited to some certain item types. */
  @Test
  void aggregatesAnyItemType() {
    Item parent = Item.of(ItemId.of("aajvkalaseisdadf"), "Payments", "aajvkalaseisdadf");
    Item dependency1 = Item.of(ItemId.of("retdsfsdaawsda"), "Auth", "retdsfsdaawsda");
    Item dependency2 = Item.of(ItemId.of("safasfsd"), "Billing", "safasfsd");
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
                Dependency.of(parent.getId(), dependency1.getId(), "includes"),
                Dependency.of(parent.getId(), dependency1.getId(), "depends_on")));

    Map<ItemId, HealthStatus> serviceStatuses =
        Map.of(
            dependency1.getId(), HealthStatus.UP,
            dependency2.getId(), HealthStatus.UP);

    Map<ItemId, HealthStatus> results = aggregator.aggregate(catalog, serviceStatuses);

    assertThat(results).containsEntry(parent.getId(), HealthStatus.UP);
  }
}
