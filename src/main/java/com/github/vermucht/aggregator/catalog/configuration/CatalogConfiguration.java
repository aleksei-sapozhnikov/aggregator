package com.github.vermucht.aggregator.catalog.configuration;

import com.github.vermucht.aggregator.catalog.model.Catalog;
import jakarta.annotation.Nonnull;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.io.Resource;
import org.springframework.core.io.ResourceLoader;

/** Wires the catalog into the application context at startup. */
@Configuration
public class CatalogConfiguration {
  /**
   * Creates the catalog bean from the configured catalog definition resource.
   *
   * @param resourceLoader loader for catalog resources
   * @param catalogLoader loader for the raw catalog definition
   * @param catalogValidator validator that builds the runtime catalog
   * @param catalogPath resource path to the catalog definition
   * @return validated, immutable catalog
   */
  @Bean
  @Nonnull
  public Catalog catalog(
      @Nonnull ResourceLoader resourceLoader,
      @Nonnull CatalogLoader catalogLoader,
      @Nonnull CatalogValidator catalogValidator,
      @Nonnull @Value("${catalog.path}") String catalogPath) {
    Resource resource = resourceLoader.getResource(catalogPath);
    if (!resource.exists()) {
      throw new IllegalStateException("Catalog file not found at " + catalogPath);
    }
    return catalogValidator.validate(catalogLoader.loadDefinition(resource));
  }
}
