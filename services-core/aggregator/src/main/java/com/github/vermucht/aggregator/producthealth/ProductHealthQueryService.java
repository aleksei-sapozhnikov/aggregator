package com.github.vermucht.aggregator.producthealth;

import com.github.vermucht.aggregator.catalog.configuration.CatalogRegistry;
import com.github.vermucht.aggregator.catalog.model.Catalog;
import com.github.vermucht.aggregator.catalog.model.Dependency;
import com.github.vermucht.aggregator.catalog.model.Item;
import com.github.vermucht.aggregator.catalog.model.ItemId;
import com.github.vermucht.aggregator.producthealth.model.DependencyHealthFact;
import com.github.vermucht.aggregator.producthealth.model.HealthSignalFact;
import com.github.vermucht.aggregator.producthealth.model.ItemHealthFact;
import com.github.vermucht.aggregator.producthealth.model.ProductHealthLookup;
import com.github.vermucht.aggregator.signal.model.HealthStatus;
import com.github.vermucht.aggregator.signal.state.HealthSignalStateStore;
import com.github.vermucht.aggregator.signal.state.ItemHealthStateStore;
import com.github.vermucht.aggregator.signalsource.polling.PollingSignalSourceRegistry;
import jakarta.annotation.Nonnull;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Queue;
import java.util.Set;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

/** Canonical read boundary for current deterministic product health facts. */
@Service
public class ProductHealthQueryService {
  private final CatalogRegistry catalogRegistry;
  private final ItemHealthStateStore itemHealthStateStore;
  private final HealthSignalStateStore signalStateStore;
  private final PollingSignalSourceRegistry signalSourceRegistry;

  public ProductHealthQueryService(
      @Nonnull CatalogRegistry catalogRegistry,
      @Nonnull ItemHealthStateStore itemHealthStateStore,
      @Nonnull HealthSignalStateStore signalStateStore,
      @Nonnull PollingSignalSourceRegistry signalSourceRegistry) {
    this.catalogRegistry = Objects.requireNonNull(catalogRegistry, "catalogRegistry");
    this.itemHealthStateStore =
        Objects.requireNonNull(itemHealthStateStore, "itemHealthStateStore");
    this.signalStateStore = Objects.requireNonNull(signalStateStore, "signalStateStore");
    this.signalSourceRegistry =
        Objects.requireNonNull(signalSourceRegistry, "signalSourceRegistry");
  }

  @Nonnull
  public ProductHealthLookup getItemHealthById(@Nonnull String itemId) {
    Objects.requireNonNull(itemId, "itemId");
    Catalog catalog = catalogRegistry.getCatalog();
    Item item = catalog.items().get(ItemId.of(itemId));
    if (item == null) {
      return new ProductHealthLookup(
          false, itemId, null, List.of(), "No catalog item matched the id.");
    }
    return new ProductHealthLookup(
        true, itemId, buildItemHealthFact(item.getId(), catalog), List.of(), null);
  }

  @Nonnull
  public ProductHealthLookup searchItemHealth(@Nonnull String query) {
    Objects.requireNonNull(query, "query");
    Catalog catalog = catalogRegistry.getCatalog();
    List<Item> matches = searchItems(catalog, query);
    if (matches.size() == 1) {
      return new ProductHealthLookup(
          true, query, buildItemHealthFact(matches.getFirst().getId(), catalog), List.of(), null);
    }
    List<ProductHealthLookup.ItemCandidate> candidates =
        matches.stream()
            .map(
                item ->
                    new ProductHealthLookup.ItemCandidate(item.getId().getValue(), item.getTitle()))
            .sorted(Comparator.comparing(ProductHealthLookup.ItemCandidate::title))
            .toList();
    String message =
        matches.isEmpty()
            ? "No catalog item matched the query."
            : "Multiple catalog items matched the query.";
    return new ProductHealthLookup(false, query, null, candidates, message);
  }

  @Nonnull
  public List<ItemHealthFact> listUnhealthyItems() {
    return listAllItems().stream().filter(item -> item.state() != HealthStatus.UP).toList();
  }

  @Nonnull
  public List<ItemHealthFact> listAllItems() {
    Catalog catalog = catalogRegistry.getCatalog();
    return catalog.items().values().stream()
        .map(item -> buildItemHealthFact(item.getId(), catalog))
        .sorted(
            Comparator.comparingInt((ItemHealthFact item) -> severity(item.state()))
                .thenComparing(ItemHealthFact::title))
        .toList();
  }

  private ItemHealthFact buildItemHealthFact(ItemId itemId, Catalog catalog) {
    Item item = catalog.items().get(itemId);
    String title = item != null ? item.getTitle() : itemId.getValue();
    List<DependencyHealthFact> dependencies = dependencyFacts(itemId, catalog);
    List<DependencyHealthFact> affectingDependencies =
        dependencies.stream().filter(dependency -> dependency.state() != HealthStatus.UP).toList();
    return new ItemHealthFact(
        itemId.getValue(),
        title,
        itemHealthStateStore.getAggregatedStatus(itemId),
        itemHealthStateStore.getRawStatus(itemId),
        signalFacts(itemId),
        dependencies,
        affectingDependencies);
  }

  private List<HealthSignalFact> signalFacts(ItemId itemId) {
    return signalSourceRegistry.getSignalSources().stream()
        .filter(source -> source.itemId().equals(itemId))
        .map(
            source ->
                new HealthSignalFact(
                    source.id(),
                    source.title(),
                    source.source(),
                    signalStateStore.getStatus(itemId, source.id())))
        .sorted(Comparator.comparing(HealthSignalFact::title))
        .toList();
  }

  private List<DependencyHealthFact> dependencyFacts(ItemId itemId, Catalog catalog) {
    Map<ItemId, List<ItemId>> adjacency = new HashMap<>();
    for (Dependency dependency : catalog.dependencies()) {
      adjacency
          .computeIfAbsent(dependency.getSourceId(), _ -> new ArrayList<>())
          .add(dependency.getTargetId());
    }

    List<DependencyHealthFact> facts = new ArrayList<>();
    Queue<DependencyTraversal> queue = new ArrayDeque<>();
    Set<ItemId> visited = new HashSet<>();
    for (ItemId directDependency : adjacency.getOrDefault(itemId, List.of())) {
      queue.add(new DependencyTraversal(directDependency, 1));
    }
    while (!queue.isEmpty()) {
      DependencyTraversal current = queue.remove();
      if (!visited.add(current.itemId())) {
        continue;
      }
      Item dependency = catalog.items().get(current.itemId());
      String title = dependency != null ? dependency.getTitle() : current.itemId().getValue();
      facts.add(
          new DependencyHealthFact(
              current.itemId().getValue(),
              title,
              itemHealthStateStore.getAggregatedStatus(current.itemId()),
              current.depth()));
      for (ItemId next : adjacency.getOrDefault(current.itemId(), List.of())) {
        queue.add(new DependencyTraversal(next, current.depth() + 1));
      }
    }
    facts.sort(
        Comparator.comparingInt(DependencyHealthFact::depth)
            .thenComparing(DependencyHealthFact::title));
    return facts;
  }

  private List<Item> searchItems(Catalog catalog, String query) {
    String normalizedQuery = normalize(query);
    if (!StringUtils.hasText(normalizedQuery)) {
      return List.of();
    }

    List<Item> exact =
        catalog.items().values().stream()
            .filter(
                item ->
                    normalize(item.getId().getValue()).equals(normalizedQuery)
                        || normalize(item.getTitle()).equals(normalizedQuery))
            .toList();
    if (!exact.isEmpty()) {
      return exact;
    }

    return catalog.items().values().stream()
        .filter(
            item ->
                normalize(item.getId().getValue()).contains(normalizedQuery)
                    || normalize(item.getTitle()).contains(normalizedQuery))
        .toList();
  }

  private static String normalize(String value) {
    return value == null ? "" : value.trim().toLowerCase(Locale.ROOT);
  }

  private static int severity(HealthStatus status) {
    return switch (status) {
      case DOWN -> 0;
      case UNKNOWN -> 1;
      case UP -> 2;
    };
  }

  private record DependencyTraversal(ItemId itemId, int depth) {}
}
