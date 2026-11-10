package com.github.vermucht.aggregator.signal.model;

import com.github.vermucht.aggregator.catalog.model.ItemId;
import jakarta.annotation.Nonnull;
import jakarta.annotation.Nullable;
import java.time.Instant;
import java.util.Map;
import java.util.Objects;

/**
 * Represents an observed health signal for a catalog item.
 *
 * @param itemId catalog item associated with the signal
 * @param id identifier of the signal stream that produced the observation
 * @param status health status outcome
 * @param observedAt time the signal was observed
 * @param source signal source identifier
 * @param message optional descriptive message for the signal
 * @param details additional signal details as key-value pairs
 */
public record HealthSignal(
    @Nonnull ItemId itemId,
    @Nonnull String id,
    @Nonnull HealthStatus status,
    @Nonnull Instant observedAt,
    @Nonnull String source,
    @Nullable String message,
    @Nonnull Map<String, String> details) {
  public HealthSignal {
    Objects.requireNonNull(itemId, "itemId");
    Objects.requireNonNull(id, "id");
    if (id.isBlank()) {
      throw new IllegalArgumentException("id must not be blank");
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
