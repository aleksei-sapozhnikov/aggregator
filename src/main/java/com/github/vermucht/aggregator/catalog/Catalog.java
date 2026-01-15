package com.github.vermucht.aggregator.catalog;

import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import jakarta.annotation.Nonnull;

/**
 * In-memory service catalog for runtime access.
 */
public final class Catalog {
	@Nonnull
	private final Map<ItemId, Item> items;
	@Nonnull
	private final List<Dependency> dependencies;

	/**
	 * Creates an immutable catalog from item and dependency collections.
	 *
	 * @param items catalog items keyed by identifier
	 * @param dependencies catalog dependency list
	 */
	public Catalog(@Nonnull Map<ItemId, Item> items, @Nonnull List<Dependency> dependencies) {
		this.items = Collections.unmodifiableMap(Objects.requireNonNull(items, "items"));
		this.dependencies = Collections.unmodifiableList(Objects.requireNonNull(dependencies, "dependencies"));
	}

	/**
	 * Returns all catalog items keyed by identifier.
	 *
	 * @return catalog items
	 */
	@Nonnull
	public Map<ItemId, Item> getItems() {
		return items;
	}

	/**
	 * Returns the list of dependencies between catalog items.
	 *
	 * @return catalog dependencies
	 */
	@Nonnull
	public List<Dependency> getDependencies() {
		return dependencies;
	}
}
