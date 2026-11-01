package com.github.vermucht.aggregator.catalog.model;

import jakarta.annotation.Nonnull;
import jakarta.annotation.Nullable;
import java.util.Objects;

/** Catalog item definition used for modeling products and services. */
public final class Item {
  @Nonnull private final ItemId id;
  @Nonnull private final String title;
  @Nullable private final String shortDescription;
  @Nullable private final String fullDescription;

  private Item(
      @Nonnull ItemId id,
      @Nonnull String title,
      @Nullable String shortDescription,
      @Nullable String fullDescription) {
    this.id = Objects.requireNonNull(id, "id");
    this.title = Objects.requireNonNull(title, "title");
    if (title.isBlank()) {
      throw new IllegalArgumentException("title must not be blank");
    }
    this.shortDescription = normalizeOptionalText(shortDescription);
    this.fullDescription = normalizeOptionalText(fullDescription);
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
    return new Item(id, title, null, null);
  }

  /**
   * Creates a catalog item instance with optional descriptions.
   *
   * @param id item identifier
   * @param title item display title
   * @param shortDescription concise item summary
   * @param fullDescription detailed item description
   * @return catalog item
   */
  @Nonnull
  public static Item of(
      @Nonnull ItemId id,
      @Nonnull String title,
      @Nullable String shortDescription,
      @Nullable String fullDescription) {
    return new Item(id, title, shortDescription, fullDescription);
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

  /**
   * Returns the concise item summary, when provided by the catalog.
   *
   * @return item summary, or null when missing
   */
  @Nullable
  public String getShortDescription() {
    return shortDescription;
  }

  /**
   * Returns the detailed item description, when provided by the catalog.
   *
   * @return item description, or null when missing
   */
  @Nullable
  public String getFullDescription() {
    return fullDescription;
  }

  @Nullable
  private static String normalizeOptionalText(@Nullable String value) {
    if (value == null || value.isBlank()) {
      return null;
    }
    return value.strip();
  }
}
