package com.github.vermucht.aggregator.catalog;

import java.util.Objects;
import jakarta.annotation.Nonnull;

/**
 * Catalog item definition used for modeling products and services.
 */
public final class Item {
	@Nonnull
	private final ItemId id;
	@Nonnull
	private final String name;
	@Nonnull
	private final String type;

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

	@Nonnull
	public static Item of(@Nonnull ItemId id, @Nonnull String name, @Nonnull String type) {
		return new Item(id, name, type);
	}

	@Nonnull
	public ItemId getId() {
		return id;
	}

	@Nonnull
	public String getName() {
		return name;
	}

	@Nonnull
	public String getType() {
		return type;
	}
}
