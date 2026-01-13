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

	public Catalog(@Nonnull Map<ItemId, Item> items, @Nonnull List<Dependency> dependencies) {
		this.items = Collections.unmodifiableMap(Objects.requireNonNull(items, "items"));
		this.dependencies = Collections.unmodifiableList(Objects.requireNonNull(dependencies, "dependencies"));
	}

	@Nonnull
	public Map<ItemId, Item> getItems() {
		return items;
	}

	@Nonnull
	public List<Dependency> getDependencies() {
		return dependencies;
	}
}
