package com.github.vermucht.aggregator.catalog;

import java.util.Objects;
import jakarta.annotation.Nonnull;

/**
 * Stable identifier for catalog items. Independent of persistence or transport.
 */
public final class ItemId {
	@Nonnull
	private final String value;

	private ItemId(@Nonnull String value) {
		this.value = Objects.requireNonNull(value, "value");
		if (value.isBlank()) {
			throw new IllegalArgumentException("value must not be blank");
		}
	}

	@Nonnull
	public static ItemId of(@Nonnull String value) {
		return new ItemId(value);
	}

	@Nonnull
	public String getValue() {
		return value;
	}

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

	@Override
	public int hashCode() {
		return value.hashCode();
	}

	@Override
	public String toString() {
		return value;
	}
}
