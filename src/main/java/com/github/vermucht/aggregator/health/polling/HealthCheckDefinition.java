package com.github.vermucht.aggregator.health.polling;

import jakarta.annotation.Nullable;
import java.time.Duration;
import java.util.List;

public record HealthCheckDefinition(
	@Nullable List<HttpCheckDefinition> httpChecks
) {
	public record HttpCheckDefinition(
		@Nullable String checkId,
		@Nullable String catalogItemId,
		@Nullable String url,
		@Nullable String method,
		@Nullable Duration timeout,
		@Nullable List<Integer> expectedStatusCodes,
		@Nullable Duration interval
	) {}
}
