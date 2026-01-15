package com.github.vermucht.aggregator.catalog;

import jakarta.annotation.Nonnull;
import java.util.Objects;

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

	/**
	 * Creates a dependency between two catalog items.
	 *
	 * @param sourceId source item identifier
	 * @param targetId target item identifier
	 * @param type dependency classification
	 * @return dependency instance
	 */
	@Nonnull
	public static Dependency of(@Nonnull ItemId sourceId, @Nonnull ItemId targetId, @Nonnull String type) {
		return new Dependency(sourceId, targetId, type);
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

	/**
	 * Returns the dependency type.
	 *
	 * @return dependency type
	 */
	@Nonnull
	public String getType() {
		return type;
	}
}
