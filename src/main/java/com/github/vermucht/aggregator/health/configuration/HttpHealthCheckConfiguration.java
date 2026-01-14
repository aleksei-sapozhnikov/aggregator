package com.github.vermucht.aggregator.health.configuration;

import jakarta.annotation.Nullable;
import java.time.Duration;
import java.util.List;

public record HttpHealthCheckConfiguration(
	@Nullable String checkId,
	@Nullable String catalogItemId,
	@Nullable String url,
	@Nullable String method,
	@Nullable Duration timeout,
	@Nullable List<Integer> expectedStatusCodes,
	@Nullable Duration interval
) implements HealthCheckConfiguration {
	@Override
	public HealthCheckType type() {
		return HealthCheckType.HTTP;
	}
}
