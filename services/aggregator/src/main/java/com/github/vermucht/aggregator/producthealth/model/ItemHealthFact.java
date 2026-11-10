package com.github.vermucht.aggregator.producthealth.model;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.github.vermucht.aggregator.signal.model.HealthStatus;
import jakarta.annotation.Nonnull;
import jakarta.annotation.Nullable;
import java.util.List;

/** Deterministic health facts for one catalog item. */
@JsonInclude(JsonInclude.Include.NON_NULL)
public record ItemHealthFact(
    @Nonnull String itemId,
    @Nonnull String title,
    @Nullable String shortDescription,
    @Nullable String fullDescription,
    @Nonnull HealthStatus state,
    @Nonnull HealthStatus ownState,
    @Nonnull List<HealthSignalFact> signals,
    @Nonnull List<DependencyHealthFact> dependencies,
    @Nonnull List<DependencyHealthFact> affectingDependencies) {}
