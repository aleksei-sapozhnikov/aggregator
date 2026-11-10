package com.github.vermucht.aggregator.catalog.model;

import jakarta.annotation.Nonnull;
import java.util.Objects;

/** Directed relationship from one item to another. */
public final class Dependency {
  @Nonnull private final ItemId sourceId;
  @Nonnull private final ItemId targetId;

  private Dependency(@Nonnull ItemId sourceId, @Nonnull ItemId targetId) {
    this.sourceId = Objects.requireNonNull(sourceId, "sourceId");
    this.targetId = Objects.requireNonNull(targetId, "targetId");
  }

  /**
   * Creates a dependency between two catalog items.
   *
   * @param sourceId source item identifier
   * @param targetId target item identifier
   * @return dependency instance
   */
  @Nonnull
  public static Dependency of(@Nonnull ItemId sourceId, @Nonnull ItemId targetId) {
    return new Dependency(sourceId, targetId);
  }

  /**
   * Returns the source item identifier.
   *
   * @return source item identifier
   */
  @Nonnull
  public ItemId getSourceId() {
    return sourceId;
  }

  /**
   * Returns the target item identifier.
   *
   * @return target item identifier
   */
  @Nonnull
  public ItemId getTargetId() {
    return targetId;
  }
}
