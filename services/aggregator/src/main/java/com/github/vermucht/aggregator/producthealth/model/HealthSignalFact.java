package com.github.vermucht.aggregator.producthealth.model;

import com.github.vermucht.aggregator.signal.model.HealthStatus;
import jakarta.annotation.Nonnull;

/** Current deterministic state for one configured health signal. */
public record HealthSignalFact(
    @Nonnull String id,
    @Nonnull String title,
    @Nonnull String source,
    @Nonnull HealthStatus state) {}
