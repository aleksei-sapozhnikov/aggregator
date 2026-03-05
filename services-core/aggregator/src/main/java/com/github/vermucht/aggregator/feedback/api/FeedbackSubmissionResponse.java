package com.github.vermucht.aggregator.feedback.api;

import jakarta.annotation.Nonnull;
import java.time.Instant;

/** Response returned after feedback has been persisted. */
public record FeedbackSubmissionResponse(@Nonnull String id, @Nonnull Instant receivedAt) {}
