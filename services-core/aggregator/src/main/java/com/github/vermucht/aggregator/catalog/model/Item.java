package com.github.vermucht.aggregator.catalog.model;

import jakarta.annotation.Nonnull;
import java.util.Objects;

/** Catalog item definition used for modeling products and services. */
public final class Item {
  @Nonnull private final ItemId id;
  @Nonnull private final String title;

  private Item(@Nonnull ItemId id, @Nonnull String title) {
    this.id = Objects.requireNonNull(id, "id");
    this.title = Objects.requireNonNull(title, "title");
    if (title.isBlank()) {
      throw new IllegalArgumentException("title must not be blank");
    }
  }

  /**
   * Creates a catalog item instance.
   *
   * @param id item identifier
   * @param title item display title
   * @return catalog item
   */
  @Nonnull
  public static Item of(@Nonnull ItemId id, @Nonnull String title) {
    return new Item(id, title);
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
   * Returns the display title of the item.
   *
   * @return item title
   */
  @Nonnull
  public String getTitle() {
    return title;
  }
}
