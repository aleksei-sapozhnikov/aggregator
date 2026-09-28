package com.github.vermucht.aggregator.producthealth.model;

import jakarta.annotation.Nonnull;
import java.util.List;

/** Result of resolving a user/tool item query to deterministic health facts. */
public record ProductHealthLookup(
    boolean found,
    @Nonnull String query,
    ItemHealthFact item,
    @Nonnull List<ItemCandidate> candidates,
    String message) {
  /** Catalog item candidate returned when a query is missing or ambiguous. */
  public record ItemCandidate(@Nonnull String itemId, @Nonnull String title) {}
}
