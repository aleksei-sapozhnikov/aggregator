package com.github.vermucht.aggregator.feedback.model;

import jakarta.annotation.Nonnull;
import java.time.Instant;
import java.util.Objects;

/** Immutable persisted feedback entry. */
public record FeedbackEntry(@Nonnull String id, @Nonnull Instant receivedAt, @Nonnull String text) {
  public FeedbackEntry {
    Objects.requireNonNull(id, "id");
    if (id.isBlank()) {
      throw new IllegalArgumentException("id must not be blank");
    }
    Objects.requireNonNull(receivedAt, "receivedAt");
    Objects.requireNonNull(text, "text");
  }
}
