package com.github.vermucht.aggregator.health.model;

import com.github.vermucht.aggregator.catalog.ItemId;
import jakarta.annotation.Nonnull;
import jakarta.annotation.Nullable;
import java.time.Instant;
import java.util.Map;
import java.util.Objects;

public record HealthSignal(
	@Nonnull ItemId catalogItemId,
	@Nonnull String checkId,
	@Nonnull HealthStatus status,
	@Nonnull Instant observedAt,
	@Nonnull String source,
	@Nullable String message,
	@Nonnull Map<String, String> details
) {
	public HealthSignal {
		Objects.requireNonNull(catalogItemId, "catalogItemId");
		Objects.requireNonNull(checkId, "checkId");
		if (checkId.isBlank()) {
			throw new IllegalArgumentException("checkId must not be blank");
		}
		Objects.requireNonNull(status, "status");
		Objects.requireNonNull(observedAt, "observedAt");
		Objects.requireNonNull(source, "source");
		if (source.isBlank()) {
			throw new IllegalArgumentException("source must not be blank");
		}
		if (details == null) {
			details = Map.of();
		} else {
			details = Map.copyOf(details);
		}
	}
}
