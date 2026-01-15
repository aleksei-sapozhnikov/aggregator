package com.github.vermucht.aggregator.health.aggregation;

import static org.assertj.core.api.Assertions.assertThat;

import com.github.vermucht.aggregator.catalog.Catalog;
import com.github.vermucht.aggregator.catalog.Dependency;
import com.github.vermucht.aggregator.catalog.Item;
import com.github.vermucht.aggregator.catalog.ItemId;
import com.github.vermucht.aggregator.health.model.HealthStatus;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

class ProductHealthAggregatorTest {
	private final ProductHealthAggregator aggregator = new ProductHealthAggregator();

	/**
	 * Verifies aggregation reports UP when all included services are UP.
	 */
	@Test
	void aggregatesUpWhenAllIncludedServicesAreUp() {
		Item product = Item.of(ItemId.of("product:payments"), "Payments", "product");
		Item auth = Item.of(ItemId.of("service:auth"), "Auth", "service");
		Item billing = Item.of(ItemId.of("service:billing"), "Billing", "service");
		Catalog catalog = new Catalog(
			Map.of(product.getId(), product, auth.getId(), auth, billing.getId(), billing),
			List.of(
				Dependency.of(product.getId(), auth.getId(), "includes"),
				Dependency.of(product.getId(), billing.getId(), "includes")
			)
		);

		Map<ItemId, HealthStatus> serviceStatuses = Map.of(
			auth.getId(), HealthStatus.UP,
			billing.getId(), HealthStatus.UP
		);

		Map<ItemId, HealthStatus> results = aggregator.aggregate(catalog, serviceStatuses);

		assertThat(results).containsEntry(product.getId(), HealthStatus.UP);
	}

	/**
	 * Verifies aggregation reports DOWN when any included service is DOWN.
	 */
	@Test
	void aggregatesDownWhenAnyIncludedServiceIsDown() {
		Item product = Item.of(ItemId.of("product:commerce"), "Commerce", "product");
		Item cart = Item.of(ItemId.of("service:cart"), "Cart", "service");
		Item pricing = Item.of(ItemId.of("service:pricing"), "Pricing", "service");
		Catalog catalog = new Catalog(
			Map.of(product.getId(), product, cart.getId(), cart, pricing.getId(), pricing),
			List.of(
				Dependency.of(product.getId(), cart.getId(), "includes"),
				Dependency.of(product.getId(), pricing.getId(), "includes")
			)
		);

		Map<ItemId, HealthStatus> serviceStatuses = Map.of(
			cart.getId(), HealthStatus.DOWN,
			pricing.getId(), HealthStatus.UP
		);

		Map<ItemId, HealthStatus> results = aggregator.aggregate(catalog, serviceStatuses);

		assertThat(results).containsEntry(product.getId(), HealthStatus.DOWN);
	}

	/**
	 * Verifies aggregation reports UNKNOWN when any included service is UNKNOWN.
	 */
	@Test
	void aggregatesUnknownWhenAnyIncludedServiceIsUnknown() {
		Item product = Item.of(ItemId.of("product:identity"), "Identity", "product");
		Item directory = Item.of(ItemId.of("service:directory"), "Directory", "service");
		Item policy = Item.of(ItemId.of("service:policy"), "Policy", "service");
		Catalog catalog = new Catalog(
			Map.of(product.getId(), product, directory.getId(), directory, policy.getId(), policy),
			List.of(
				Dependency.of(product.getId(), directory.getId(), "includes"),
				Dependency.of(product.getId(), policy.getId(), "includes")
			)
		);

		Map<ItemId, HealthStatus> serviceStatuses = Map.of(
			directory.getId(), HealthStatus.UP,
			policy.getId(), HealthStatus.UNKNOWN
		);

		Map<ItemId, HealthStatus> results = aggregator.aggregate(catalog, serviceStatuses);

		assertThat(results).containsEntry(product.getId(), HealthStatus.UNKNOWN);
	}

	/**
	 * Verifies aggregation reports UNKNOWN when a product has no included services.
	 */
	@Test
	void aggregatesUnknownWhenNoIncludedServicesExist() {
		Item product = Item.of(ItemId.of("product:empty"), "Empty", "product");
		Item service = Item.of(ItemId.of("service:logging"), "Logging", "service");
		Catalog catalog = new Catalog(
			Map.of(product.getId(), product, service.getId(), service),
			List.of(Dependency.of(service.getId(), product.getId(), "depends_on"))
		);

		Map<ItemId, HealthStatus> results = aggregator.aggregate(catalog, Map.of());

		assertThat(results).containsEntry(product.getId(), HealthStatus.UNKNOWN);
	}

	/**
	 * Verifies aggregation treats missing service status as UNKNOWN.
	 */
	@Test
	void treatsMissingServiceStatusAsUnknown() {
		Item product = Item.of(ItemId.of("product:shipping"), "Shipping", "product");
		Item tracking = Item.of(ItemId.of("service:tracking"), "Tracking", "service");
		Catalog catalog = new Catalog(
			Map.of(product.getId(), product, tracking.getId(), tracking),
			List.of(Dependency.of(product.getId(), tracking.getId(), "includes"))
		);

		Map<ItemId, HealthStatus> results = aggregator.aggregate(catalog, Map.of());

		assertThat(results).containsEntry(product.getId(), HealthStatus.UNKNOWN);
	}
}
