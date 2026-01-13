package com.github.vermucht.aggregator.catalog;

import jakarta.annotation.Nullable;
import java.util.List;

/**
 * Raw catalog definition used for parsing JSON/YAML payloads.
 */
public record CatalogDefinition(
	@Nullable List<ItemDefinition> items,
	@Nullable List<DependencyDefinition> dependencies
) {
	public record ItemDefinition(
		@Nullable String id,
		@Nullable String name,
		@Nullable String type
	) {}

	public record DependencyDefinition(
		@Nullable String sourceId,
		@Nullable String targetId,
		@Nullable String type
	) {}
}
