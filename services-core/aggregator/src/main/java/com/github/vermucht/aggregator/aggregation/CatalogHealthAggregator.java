package com.github.vermucht.aggregator.aggregation;

import com.github.vermucht.aggregator.catalog.model.Catalog;
import com.github.vermucht.aggregator.catalog.model.Dependency;
import com.github.vermucht.aggregator.catalog.model.Item;
import com.github.vermucht.aggregator.catalog.model.ItemId;
import com.github.vermucht.aggregator.signal.model.HealthStatus;
import jakarta.annotation.Nonnull;
import java.util.*;
import org.springframework.stereotype.Component;

/**
 * Aggregates catalog item health from the health of dependent items.
 *
 * <p>Aggregation rules:
 *
 * <ul>
 *   <li>All dependencies are considered regardless of dependency type.
 *   <li>If an item has no dependencies, its health is derived from its own status.
 *   <li>If any dependency is {@link HealthStatus#DOWN}, the item is {@link HealthStatus#DOWN}.
 *   <li>If no dependency is down but at least one is {@link HealthStatus#UNKNOWN}, the item is
 *       {@link HealthStatus#UNKNOWN}.
 *   <li>If all dependencies are {@link HealthStatus#UP}, the item is {@link HealthStatus#UP}.
 * </ul>
 */
@Component
public final class CatalogHealthAggregator {
  /**
   * Aggregates catalog item health from direct item health based on catalog relationships.
   *
   * @param catalog catalog defining products, services, and dependencies
   * @param serviceStatuses map of service health status keyed by catalog item identifier
   * @return immutable map of product health status keyed by catalog item identifier
   */
  @Nonnull
  public Map<ItemId, HealthStatus> aggregate(
      @Nonnull Catalog catalog, @Nonnull Map<ItemId, HealthStatus> serviceStatuses) {
    Objects.requireNonNull(catalog, "catalog");
    Objects.requireNonNull(serviceStatuses, "serviceStatuses");

    Map<ItemId, Item> items = catalog.items();
    Map<ItemId, HealthStatus> results = new HashMap<>();

    for (Item item : items.values()) {
      results.put(
          item.getId(),
          getState(item.getId(), catalog, serviceStatuses, new HashMap<>(), new HashSet<>()));
    }

    return Collections.unmodifiableMap(results);
  }

  /**
   * Returns the aggregated health state for a single catalog item.
   *
   * @param itemId item identifier to evaluate
   * @param catalog catalog defining items and dependencies
   * @param serviceStatuses map of service health status keyed by catalog item identifier
   * @return aggregated health status for the item
   */
  @Nonnull
  public HealthStatus getState(
      @Nonnull ItemId itemId,
      @Nonnull Catalog catalog,
      @Nonnull Map<ItemId, HealthStatus> serviceStatuses) {
    Objects.requireNonNull(itemId, "itemId");
    Objects.requireNonNull(catalog, "catalog");
    Objects.requireNonNull(serviceStatuses, "serviceStatuses");
    return getState(itemId, catalog, serviceStatuses, new HashMap<>(), new HashSet<>());
  }

  private HealthStatus getState(
      ItemId itemId,
      Catalog catalog,
      Map<ItemId, HealthStatus> serviceStatuses,
      Map<ItemId, HealthStatus> memo,
      Set<ItemId> visiting) {
    HealthStatus cached = memo.get(itemId);
    if (cached != null) {
      return cached;
    }
    if (!visiting.add(itemId)) {
      return HealthStatus.UNKNOWN;
    }

    HealthStatus ownStatus = serviceStatuses.getOrDefault(itemId, HealthStatus.UNKNOWN);
    Map<ItemId, List<ItemId>> dependencies = mapDependencies(catalog.dependencies());
    List<ItemId> dependencyIds = dependencies.getOrDefault(itemId, List.of());

    HealthStatus status;
    if (dependencyIds.isEmpty() || ownStatus == HealthStatus.DOWN) {
      status = ownStatus;
    } else {
      Set<HealthStatus> dependencyStatuses = EnumSet.noneOf(HealthStatus.class);
      for (ItemId dependencyId : dependencyIds) {
        dependencyStatuses.add(getState(dependencyId, catalog, serviceStatuses, memo, visiting));
      }
      if (dependencyStatuses.contains(HealthStatus.DOWN)) {
        status = HealthStatus.DOWN;
      } else if (dependencyStatuses.contains(HealthStatus.UNKNOWN)
          || dependencyStatuses.isEmpty()) {
        status = HealthStatus.UNKNOWN;
      } else {
        status = HealthStatus.UP;
      }
    }

    visiting.remove(itemId);
    memo.put(itemId, status);
    return status;
  }

  private Map<ItemId, List<ItemId>> mapDependencies(List<Dependency> dependencies) {
    Map<ItemId, List<ItemId>> itemDependencies = new HashMap<>();
    for (Dependency dependency : dependencies) {
      itemDependencies
          .computeIfAbsent(dependency.getSourceId(), key -> new ArrayList<>())
          .add(dependency.getTargetId());
    }
    return itemDependencies;
  }
}
