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
   * @param name display name for the item
   * @param type classification of the item
   */
  public record ItemDefinition(@Nullable String id, @Nullable String name, @Nullable String type) {}

  /**
   * Raw dependency entry from the catalog payload.
   *
   * @param sourceId identifier of the source item
   * @param targetId identifier of the target item
   * @param type classification of the dependency relationship
   */
  public record DependencyDefinition(
      @Nullable String sourceId, @Nullable String targetId, @Nullable String type) {}
}
