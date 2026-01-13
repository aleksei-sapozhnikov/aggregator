package com.github.vermucht.aggregator.catalog;

import java.util.Objects;
import jakarta.annotation.Nonnull;

/**
 * Directed relationship from one item to another.
 */
public final class Dependency {
	@Nonnull
	private final ItemId sourceId;
	@Nonnull
	private final ItemId targetId;
	@Nonnull
	private final String type;

	private Dependency(@Nonnull ItemId sourceId, @Nonnull ItemId targetId, @Nonnull String type) {
		this.sourceId = Objects.requireNonNull(sourceId, "sourceId");
		this.targetId = Objects.requireNonNull(targetId, "targetId");
		this.type = Objects.requireNonNull(type, "type");
		if (type.isBlank()) {
			throw new IllegalArgumentException("type must not be blank");
		}
	}

	@Nonnull
	public static Dependency of(@Nonnull ItemId sourceId, @Nonnull ItemId targetId, @Nonnull String type) {
		return new Dependency(sourceId, targetId, type);
	}

	@Nonnull
	public ItemId getSourceId() {
		return sourceId;
	}

	@Nonnull
	public ItemId getTargetId() {
		return targetId;
	}

	@Nonnull
	public String getType() {
		return type;
	}
}
