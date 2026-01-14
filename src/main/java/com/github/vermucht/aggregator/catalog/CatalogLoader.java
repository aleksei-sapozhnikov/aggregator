package com.github.vermucht.aggregator.catalog;

import com.github.vermucht.aggregator.utils.DefinitionLoader;
import jakarta.annotation.Nonnull;
import java.util.Objects;
import org.springframework.core.io.Resource;
import org.springframework.stereotype.Component;

/**
 * Loads a catalog definition from JSON or YAML.
 */
@Component	
public class CatalogLoader {
	@Nonnull
	private final DefinitionLoader definitionLoader;

	/**
	 * Creates a loader for catalog definition resources.
	 *
	 * @param definitionLoader shared definition loader
	 */
	public CatalogLoader(@Nonnull DefinitionLoader definitionLoader) {
		this.definitionLoader = Objects.requireNonNull(definitionLoader, "definitionLoader");
	}

	/**
	 * Loads and parses the catalog definition from the given resource.
	 *
	 * @param resource catalog definition resource
	 * @return parsed catalog definition
	 */
	@Nonnull
	public CatalogDefinition loadDefinition(@Nonnull Resource resource) {
		CatalogDefinition definition = definitionLoader.loadDefinition(resource, CatalogDefinition.class);
		if (definition == null) {
			throw new IllegalStateException("Catalog definition must not be empty");
		}
		return definition;
	}
}
