package com.github.vermucht.aggregator.catalog.model;

import jakarta.annotation.Nonnull;
import java.util.Objects;

/** Catalog item definition used for modeling products and services. */
public final class Item {
  @Nonnull private final ItemId id;
  @Nonnull private final String name;
  @Nonnull private final String type;

  private Item(@Nonnull ItemId id, @Nonnull String name, @Nonnull String type) {
    this.id = Objects.requireNonNull(id, "id");
    this.name = Objects.requireNonNull(name, "name");
    if (name.isBlank()) {
      throw new IllegalArgumentException("name must not be blank");
    }
    this.type = Objects.requireNonNull(type, "type");
    if (type.isBlank()) {
      throw new IllegalArgumentException("type must not be blank");
    }
  }

  /**
   * Creates a catalog item instance.
   *
   * @param id item identifier
   * @param name item display name
   * @param type item classification
   * @return catalog item
   */
  @Nonnull
  public static Item of(@Nonnull ItemId id, @Nonnull String name, @Nonnull String type) {
    return new Item(id, name, type);
  }

  /**
   * Returns the identifier of the item.
   *
   * @return item identifier
   */
  @Nonnull
  public ItemId getId() {
    return id;
  }

  /**
   * Returns the display name of the item.
   *
   * @return item name
   */
  @Nonnull
  public String getName() {
    return name;
  }

  /**
   * Returns the classification of the item.
   *
   * @return item type
   */
  @Nonnull
  public String getType() {
    return type;
  }
}
