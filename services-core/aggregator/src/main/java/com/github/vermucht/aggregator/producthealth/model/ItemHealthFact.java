package com.github.vermucht.aggregator.producthealth.model;

import com.github.vermucht.aggregator.signal.model.HealthStatus;
import jakarta.annotation.Nonnull;
import java.util.List;

/** Deterministic health facts for one catalog item. */
public record ItemHealthFact(
    @Nonnull String itemId,
    @Nonnull String title,
    @Nonnull HealthStatus state,
    @Nonnull HealthStatus ownState,
    @Nonnull List<HealthSignalFact> signals,
    @Nonnull List<DependencyHealthFact> dependencies,
    @Nonnull List<DependencyHealthFact> affectingDependencies) {}
