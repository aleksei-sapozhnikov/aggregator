package com.github.vermucht.aggregator.healthcheck.configuration;

import jakarta.annotation.Nullable;
import java.util.List;

/**
 * Container for health check configurations loaded from a definition file.
 *
 * @param checks list of configured health checks
 */
public record HealthCheckDefinition(@Nullable List<HealthCheckConfiguration> checks) {}
