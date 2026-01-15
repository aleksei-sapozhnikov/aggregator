package com.github.vermucht.aggregator.health.aggregation;

import com.github.vermucht.aggregator.catalog.Catalog;
import com.github.vermucht.aggregator.catalog.Dependency;
import com.github.vermucht.aggregator.catalog.Item;
import com.github.vermucht.aggregator.catalog.ItemId;
import com.github.vermucht.aggregator.health.model.HealthStatus;
import jakarta.annotation.Nonnull;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;

/**
 * Aggregates product health from the health of underlying services.
 *
 * <p>Aggregation rules:</p>
 * <ul>
 * 	<li>Only dependencies of type {@code includes} from a product to a service are considered.</li>
 * 	<li>If a product has no included services, its health is {@link HealthStatus#UNKNOWN}.</li>
 * 	<li>If any included service is {@link HealthStatus#DOWN}, the product is {@link HealthStatus#DOWN}.</li>
 * 	<li>If no service is down but at least one is {@link HealthStatus#UNKNOWN}, the product is {@link HealthStatus#UNKNOWN}.</li>
 * 	<li>If all included services are {@link HealthStatus#UP}, the product is {@link HealthStatus#UP}.</li>
 * </ul>
 */
public final class ProductHealthAggregator {
	private static final String DEPENDENCY_TYPE_INCLUDES = "includes";
	private static final String ITEM_TYPE_PRODUCT = "product";
	private static final String ITEM_TYPE_SERVICE = "service";

	/**
	 * Aggregates product health from service health based on catalog relationships.
	 *
	 * @param catalog catalog defining products, services, and dependencies
	 * @param serviceStatuses map of service health status keyed by catalog item identifier
	 * @return immutable map of product health status keyed by catalog item identifier
	 */
	@Nonnull
	public Map<ItemId, HealthStatus> aggregate(
		@Nonnull Catalog catalog,
		@Nonnull Map<ItemId, HealthStatus> serviceStatuses
	) {
		Objects.requireNonNull(catalog, "catalog");
		Objects.requireNonNull(serviceStatuses, "serviceStatuses");

		Map<ItemId, Item> items = catalog.getItems();
		Map<ItemId, List<ItemId>> productServices = mapIncludedServices(items, catalog.getDependencies());
		Map<ItemId, HealthStatus> results = new HashMap<>();

		for (Item item : items.values()) {
			if (isType(item, ITEM_TYPE_PRODUCT)) {
				List<ItemId> includedServices = productServices.getOrDefault(item.getId(), List.of());
				results.put(item.getId(), aggregateServices(includedServices, serviceStatuses));
			}
		}

		return Collections.unmodifiableMap(results);
	}

	private Map<ItemId, List<ItemId>> mapIncludedServices(
		Map<ItemId, Item> items,
		List<Dependency> dependencies
	) {
		Map<ItemId, List<ItemId>> productServices = new HashMap<>();
		for (Dependency dependency : dependencies) {
			Item source = items.get(dependency.getSourceId());
			Item target = items.get(dependency.getTargetId());
			if (source == null || target == null) {
				continue;
			}
			if (!isType(source, ITEM_TYPE_PRODUCT) || !isType(target, ITEM_TYPE_SERVICE)) {
				continue;
			}
			if (!DEPENDENCY_TYPE_INCLUDES.equalsIgnoreCase(dependency.getType())) {
				continue;
			}
			productServices
				.computeIfAbsent(source.getId(), key -> new ArrayList<>())
				.add(target.getId());
		}
		return productServices;
	}

	private HealthStatus aggregateServices(
		List<ItemId> serviceIds,
		Map<ItemId, HealthStatus> serviceStatuses
	) {
		if (serviceIds.isEmpty()) {
			return HealthStatus.UNKNOWN;
		}

		HealthStatus aggregate = HealthStatus.UP;
		for (ItemId serviceId : serviceIds) {
			HealthStatus status = serviceStatuses.getOrDefault(serviceId, HealthStatus.UNKNOWN);
			if (status == HealthStatus.DOWN) {
				return HealthStatus.DOWN;
			}
			if (status == HealthStatus.UNKNOWN) {
				aggregate = HealthStatus.UNKNOWN;
			}
		}
		return aggregate;
	}

	private boolean isType(Item item, String expectedType) {
		return item.getType().equalsIgnoreCase(expectedType);
	}
}
