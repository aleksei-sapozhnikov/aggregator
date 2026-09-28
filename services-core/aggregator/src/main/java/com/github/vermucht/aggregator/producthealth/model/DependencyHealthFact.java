package com.github.vermucht.aggregator.producthealth.model;

import com.github.vermucht.aggregator.signal.model.HealthStatus;
import jakarta.annotation.Nonnull;

/** Deterministic health state for a direct or transitive dependency. */
public record DependencyHealthFact(
    @Nonnull String itemId, @Nonnull String title, @Nonnull HealthStatus state, int depth) {}
