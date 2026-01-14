package com.github.vermucht.aggregator.health.configuration;

import jakarta.annotation.Nullable;
import java.util.List;

public record HealthCheckDefinition(
	@Nullable List<HealthCheckConfiguration> checks
) {}
