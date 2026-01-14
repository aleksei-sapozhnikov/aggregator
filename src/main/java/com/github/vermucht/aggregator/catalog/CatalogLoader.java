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

	public CatalogLoader(@Nonnull DefinitionLoader definitionLoader) {
		this.definitionLoader = Objects.requireNonNull(definitionLoader, "definitionLoader");
	}

	@Nonnull
	public CatalogDefinition loadDefinition(@Nonnull Resource resource) {
		CatalogDefinition definition = definitionLoader.loadDefinition(resource, CatalogDefinition.class);
		if (definition == null) {
			throw new IllegalStateException("Catalog definition must not be empty");
		}
		return definition;
	}
}
