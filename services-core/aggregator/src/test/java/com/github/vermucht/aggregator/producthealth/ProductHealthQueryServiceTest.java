package com.github.vermucht.aggregator.producthealth;

import static org.assertj.core.api.Assertions.assertThat;

import com.github.vermucht.aggregator.aggregation.CatalogHealthAggregator;
import com.github.vermucht.aggregator.catalog.configuration.CatalogRegistry;
import com.github.vermucht.aggregator.catalog.model.Catalog;
import com.github.vermucht.aggregator.catalog.model.Dependency;
import com.github.vermucht.aggregator.catalog.model.Item;
import com.github.vermucht.aggregator.catalog.model.ItemId;
import com.github.vermucht.aggregator.producthealth.model.ItemHealthFact;
import com.github.vermucht.aggregator.producthealth.model.ProductHealthLookup;
import com.github.vermucht.aggregator.signal.model.HealthStatus;
import com.github.vermucht.aggregator.signal.state.HealthSignalStateStore;
import com.github.vermucht.aggregator.signal.state.ItemHealthStateStore;
import com.github.vermucht.aggregator.signalsource.polling.PollingSignalSourceRegistry;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

class ProductHealthQueryServiceTest {
  @Test
  void returnsAggregatedFactsFromDeterministicState() {
    Item checkout = Item.of(ItemId.of("product:checkout"), "Checkout");
    Item payments = Item.of(ItemId.of("service:payments"), "Payments");
    Item database = Item.of(ItemId.of("service:database"), "Database");
    Catalog catalog =
        new Catalog(
            Map.of(
                checkout.getId(), checkout, payments.getId(), payments, database.getId(), database),
            List.of(
                Dependency.of(checkout.getId(), payments.getId()),
                Dependency.of(payments.getId(), database.getId())));
    Fixture fixture = fixture(catalog);

    fixture.itemHealthStateStore().updateStatus(database.getId(), HealthStatus.DOWN);

    ProductHealthLookup lookup = fixture.queryService().searchItemHealth("Checkout");

    assertThat(lookup.found()).isTrue();
    ItemHealthFact item = lookup.item();
    assertThat(item.state()).isEqualTo(HealthStatus.DOWN);
    assertThat(item.affectingDependencies())
        .extracting("itemId")
        .containsExactly("service:payments", "service:database");
  }

  @Test
  void returnsCandidatesForAmbiguousLookup() {
    Item checkout = Item.of(ItemId.of("product:checkout"), "Checkout");
    Item checkoutApi = Item.of(ItemId.of("service:checkout-api"), "Checkout API");
    Catalog catalog =
        new Catalog(
            Map.of(checkout.getId(), checkout, checkoutApi.getId(), checkoutApi), List.of());
    Fixture fixture = fixture(catalog);

    ProductHealthLookup lookup = fixture.queryService().searchItemHealth("check");

    assertThat(lookup.found()).isFalse();
    assertThat(lookup.candidates()).hasSize(2);
  }

  @Test
  void returnsExactItemByIdWithoutSearchingByTitle() {
    Item checkout = Item.of(ItemId.of("product:checkout"), "Checkout");
    Catalog catalog = new Catalog(Map.of(checkout.getId(), checkout), List.of());
    Fixture fixture = fixture(catalog);

    ProductHealthLookup lookup = fixture.queryService().getItemHealthById("Checkout");

    assertThat(lookup.found()).isFalse();
    assertThat(lookup.candidates()).isEmpty();
  }

  private static Fixture fixture(Catalog catalog) {
    CatalogRegistry catalogRegistry = new CatalogRegistry(catalog);
    ItemHealthStateStore itemHealthStateStore =
        new ItemHealthStateStore(catalogRegistry, new CatalogHealthAggregator());
    ProductHealthQueryService queryService =
        new ProductHealthQueryService(
            catalogRegistry,
            itemHealthStateStore,
            new HealthSignalStateStore(),
            new PollingSignalSourceRegistry(List.of()));
    return new Fixture(queryService, itemHealthStateStore);
  }

  private record Fixture(
      ProductHealthQueryService queryService, ItemHealthStateStore itemHealthStateStore) {}
}
