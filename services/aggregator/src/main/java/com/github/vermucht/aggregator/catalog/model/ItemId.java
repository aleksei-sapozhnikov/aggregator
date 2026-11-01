package com.github.vermucht.aggregator.catalog.model;

import jakarta.annotation.Nonnull;
import java.util.Objects;

/** Stable identifier for catalog items. Independent of persistence or transport. */
public final class ItemId {
  @Nonnull private final String value;

  private ItemId(@Nonnull String value) {
    this.value = Objects.requireNonNull(value, "value");
    if (value.isBlank()) {
      throw new IllegalArgumentException("value must not be blank");
    }
  }

  /**
   * Creates a new item identifier from a string value.
   *
   * @param value identifier value
   * @return item identifier instance
   */
  @Nonnull
  public static ItemId of(@Nonnull String value) {
    return new ItemId(value);
  }

  /**
   * Returns the raw identifier value.
   *
   * @return identifier value
   */
  @Nonnull
  public String getValue() {
    return value;
  }

  /**
   * Compares this identifier to another object for equality.
   *
   * @param other object to compare
   * @return true if the object is an equivalent {@link ItemId}
   */
  @Override
  public boolean equals(Object other) {
    if (this == other) {
      return true;
    }
    if (!(other instanceof ItemId itemId)) {
      return false;
    }
    return value.equals(itemId.value);
  }

  /**
   * Computes the hash code for this identifier.
   *
   * @return hash code based on the identifier value
   */
  @Override
  public int hashCode() {
    return value.hashCode();
  }

  /**
   * Returns the identifier as a string.
   *
   * @return identifier value
   */
  @Override
  public String toString() {
    return value;
  }
}
