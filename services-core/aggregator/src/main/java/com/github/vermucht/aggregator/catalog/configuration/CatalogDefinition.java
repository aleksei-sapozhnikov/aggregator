package com.github.vermucht.aggregator.catalog.configuration;

import jakarta.annotation.Nullable;
import java.util.List;

/** Raw catalog definition used for parsing JSON/YAML payloads. */
public record CatalogDefinition(
    @Nullable List<ItemDefinition> items, @Nullable List<DependencyDefinition> dependencies) {
  /**
   * Raw item definition entry from the catalog payload.
   *
   * @param id unique identifier for the item
   * @param title display title for the item
   */
  public record ItemDefinition(@Nullable String id, @Nullable String title) {}

  /**
   * Raw dependency entry from the catalog payload.
   *
   * @param sourceId identifier of the source item
   * @param targetId identifier of the target item
   */
  public record DependencyDefinition(@Nullable String sourceId, @Nullable String targetId) {}

  /** Top-level schema for catalog items file. */
  public record CatalogItemsDefinition(@Nullable List<ItemDefinition> items) {}

  /** Top-level schema for catalog dependencies file. */
  public record CatalogDependenciesDefinition(@Nullable List<DependencyDefinition> dependencies) {}
}
