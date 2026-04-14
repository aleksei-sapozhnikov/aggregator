package com.github.vermucht.aggregator.catalog.configuration;

import com.github.vermucht.aggregator.catalog.model.Catalog;
import jakarta.annotation.Nonnull;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.io.Resource;
import org.springframework.core.io.ResourceLoader;

/** Wires the catalog into the application context at startup. */
@Configuration
@EnableConfigurationProperties(CatalogProperties.class)
public class CatalogConfiguration {
  /**
   * Creates the catalog bean from split catalog resources.
   *
   * @param resourceLoader loader for catalog resources
   * @param catalogLoader loader for the raw catalog definition
   * @param catalogValidator validator that builds the runtime catalog
   * @param properties catalog paths configuration
   * @return validated, immutable catalog
   */
  @Bean
  @Nonnull
  public Catalog catalog(
      @Nonnull ResourceLoader resourceLoader,
      @Nonnull CatalogLoader catalogLoader,
      @Nonnull CatalogValidator catalogValidator,
      @Nonnull CatalogProperties properties) {
    String itemsPath = properties.getItemsUrl();
    Resource itemsResource = resourceLoader.getResource(itemsPath);
    if (!itemsResource.exists()) {
      throw new IllegalStateException("Catalog items file not found at " + itemsPath);
    }
    String dependenciesPath = properties.getDependenciesUrl();
    Resource dependenciesResource = resourceLoader.getResource(dependenciesPath);
    if (!dependenciesResource.exists()) {
      throw new IllegalStateException("Catalog dependencies file not found at " + dependenciesPath);
    }
    return catalogValidator.validate(
        catalogLoader.loadDefinition(itemsResource, dependenciesResource));
  }
}
