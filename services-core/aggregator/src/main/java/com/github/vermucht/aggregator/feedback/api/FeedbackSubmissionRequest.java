package com.github.vermucht.aggregator.feedback.api;

import jakarta.annotation.Nonnull;

/** Incoming feedback payload submitted by the UI. */
public record FeedbackSubmissionRequest(@Nonnull String text) {}
