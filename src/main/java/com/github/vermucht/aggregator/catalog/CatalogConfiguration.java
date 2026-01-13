package com.github.vermucht.aggregator.catalog;

import jakarta.annotation.Nonnull;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.io.Resource;
import org.springframework.core.io.ResourceLoader;

/**
 * Wires the catalog into the application context at startup.
 */
@Configuration
public class CatalogConfiguration {
	@Bean
	@Nonnull
	public Catalog catalog(
		@Nonnull ResourceLoader resourceLoader,
		@Nonnull CatalogLoader catalogLoader,
		@Nonnull CatalogValidator catalogValidator,
		@Nonnull @Value("${catalog.path:classpath:catalog.yaml}") String catalogPath
	) {
		Resource resource = resourceLoader.getResource(catalogPath);
		if (!resource.exists()) {
			throw new IllegalStateException("Catalog file not found at " + catalogPath);
		}
		return catalogValidator.validate(catalogLoader.loadDefinition(resource));
	}
}
