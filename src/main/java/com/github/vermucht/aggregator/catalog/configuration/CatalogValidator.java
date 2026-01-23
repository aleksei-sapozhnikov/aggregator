package com.github.vermucht.aggregator.catalog.configuration;

import com.github.vermucht.aggregator.catalog.model.Catalog;
import com.github.vermucht.aggregator.catalog.model.Dependency;
import com.github.vermucht.aggregator.catalog.model.Item;
import com.github.vermucht.aggregator.catalog.model.ItemId;
import jakarta.annotation.Nonnull;
import jakarta.annotation.Nullable;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import org.springframework.stereotype.Component;

/** Validates a catalog definition and builds the immutable in-memory catalog. */
@Component
public class CatalogValidator {
  /**
   * Validates a raw catalog definition and builds the runtime catalog.
   *
   * @param definition raw catalog definition to validate
   * @return validated catalog instance
   */
  @Nonnull
  public Catalog validate(@Nonnull CatalogDefinition definition) {
    Objects.requireNonNull(definition, "definition");
    List<CatalogDefinition.ItemDefinition> itemDefinitions =
        requireList(definition.items(), "items");
    List<CatalogDefinition.DependencyDefinition> dependencyDefinitions =
        requireList(definition.dependencies(), "dependencies");
    Map<ItemId, Item> items = parseItems(itemDefinitions);
    List<Dependency> dependencies = parseDependencies(dependencyDefinitions, items.keySet());
    return new Catalog(items, dependencies);
  }

  @Nonnull
  private <T> List<T> requireList(@Nullable List<T> list, @Nonnull String listPropertyName) {
    if (list == null) {
      throw new IllegalStateException("Catalog definition must include " + listPropertyName);
    }
    return list;
  }

  @Nonnull
  private Map<ItemId, Item> parseItems(
      @Nonnull List<CatalogDefinition.ItemDefinition> itemDefinitions) {
    Map<ItemId, Item> items = new HashMap<>();
    for (int index = 0; index < itemDefinitions.size(); index++) {
      CatalogDefinition.ItemDefinition definition = itemDefinitions.get(index);
      if (definition == null) {
        throw new IllegalStateException("Catalog item at index " + index + " must not be null");
      }
      String id = requireText(definition.id(), "id", "item at index " + index);
      ItemId itemId = ItemId.of(id);
      if (items.containsKey(itemId)) {
        throw new IllegalStateException("Duplicate catalog item id: " + id);
      }
      String name = requireText(definition.name(), "name", "item " + id);
      String type = requireText(definition.type(), "type", "item " + id);
      Item item = Item.of(itemId, name, type);
      items.put(itemId, item);
    }
    return items;
  }

  @Nonnull
  private List<Dependency> parseDependencies(
      @Nonnull List<CatalogDefinition.DependencyDefinition> dependencyDefinitions,
      @Nonnull Set<ItemId> knownItemIds) {
    List<Dependency> dependencies = new ArrayList<>();
    Set<String> uniqueEdges = new HashSet<>();
    for (int index = 0; index < dependencyDefinitions.size(); index++) {
      CatalogDefinition.DependencyDefinition definition = dependencyDefinitions.get(index);
      if (definition == null) {
        throw new IllegalStateException(
            "Catalog dependency at index " + index + " must not be null");
      }
      String sourceValue =
          requireText(definition.sourceId(), "sourceId", "dependency at index " + index);
      String targetValue =
          requireText(definition.targetId(), "targetId", "dependency at index " + index);
      String type =
          requireText(definition.type(), "type", "dependency " + sourceValue + "->" + targetValue);
      ItemId sourceId = ItemId.of(sourceValue);
      ItemId targetId = ItemId.of(targetValue);
      if (!knownItemIds.contains(sourceId)) {
        throw new IllegalStateException(
            "Dependency sourceId not found in catalog items: " + sourceId);
      }
      if (!knownItemIds.contains(targetId)) {
        throw new IllegalStateException(
            "Dependency targetId not found in catalog items: " + targetId);
      }
      String edgeKey = sourceId + "->" + targetId + ":" + type;
      if (!uniqueEdges.add(edgeKey)) {
        throw new IllegalStateException("Duplicate dependency detected: " + edgeKey);
      }
      dependencies.add(Dependency.of(sourceId, targetId, type));
    }
    return dependencies;
  }

  @Nonnull
  private String requireText(
      @Nullable String value, @Nonnull String field, @Nonnull String context) {
    if (value == null || value.isBlank()) {
      throw new IllegalStateException("Catalog " + context + " must include " + field);
    }
    return value;
  }
}
