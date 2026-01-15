package com.github.vermucht.aggregator.health.model;

import com.github.vermucht.aggregator.catalog.ItemId;
import jakarta.annotation.Nonnull;
import jakarta.annotation.Nullable;
import java.time.Instant;
import java.util.Map;
import java.util.Objects;

/**
 * Represents the result of a health check execution for a catalog item.
 *
 * @param catalogItemId catalog item associated with the signal
 * @param checkId identifier of the check that produced the signal
 * @param status health status outcome
 * @param observedAt time the check was executed
 * @param source check source identifier
 * @param message optional descriptive message for the signal
 * @param details additional signal details as key-value pairs
 */
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
        details = Map.copyOf(details);
    }
}
