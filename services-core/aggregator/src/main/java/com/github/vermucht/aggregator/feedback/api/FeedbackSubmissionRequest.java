package com.github.vermucht.aggregator.feedback.api;

import jakarta.annotation.Nullable;

/** Incoming feedback payload submitted by the UI. */
public record FeedbackSubmissionRequest(@Nullable String text) {}
