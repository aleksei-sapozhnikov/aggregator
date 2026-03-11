package com.github.vermucht.aggregator.catalog.configuration;

import com.github.vermucht.aggregator.utils.DefinitionLoader;
import jakarta.annotation.Nonnull;
import java.util.Objects;
import org.springframework.core.io.Resource;
import org.springframework.stereotype.Component;

/** Loads a catalog definition from JSON or YAML. */
@Component
public class CatalogLoader {
  @Nonnull private final DefinitionLoader definitionLoader;

  /**
   * Creates a loader for catalog definition resources.
   *
   * @param definitionLoader shared definition loader
   */
  public CatalogLoader(@Nonnull DefinitionLoader definitionLoader) {
    this.definitionLoader = Objects.requireNonNull(definitionLoader, "definitionLoader");
  }

  /**
   * Loads and merges item and dependency definitions from separate resources.
   *
   * @param itemsResource catalog items definition resource
   * @param dependenciesResource catalog dependencies definition resource
   * @param itemsSchemaResource catalog items schema resource
   * @param dependenciesSchemaResource catalog dependencies schema resource
   * @return merged catalog definition
   */
  @Nonnull
  public CatalogDefinition loadDefinition(
      @Nonnull Resource itemsResource,
      @Nonnull Resource dependenciesResource,
      @Nonnull Resource itemsSchemaResource,
      @Nonnull Resource dependenciesSchemaResource) {
    CatalogDefinition.CatalogItemsDefinition itemsDefinition =
        definitionLoader.loadDefinition(
            itemsResource, itemsSchemaResource, CatalogDefinition.CatalogItemsDefinition.class);
    CatalogDefinition.CatalogDependenciesDefinition dependenciesDefinition =
        definitionLoader.loadDefinition(
            dependenciesResource,
            dependenciesSchemaResource,
            CatalogDefinition.CatalogDependenciesDefinition.class);
    return new CatalogDefinition(itemsDefinition.items(), dependenciesDefinition.dependencies());
  }
}
