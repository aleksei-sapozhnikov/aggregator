package com.github.vermucht.aggregator.healthcheck.configuration;

import jakarta.annotation.Nonnull;
import jakarta.annotation.Nullable;
import java.time.Duration;
import java.util.List;

/**
 * Configuration for an HTTP health check entry.
 *
 * @param checkId identifier for the check
 * @param catalogItemId catalog item identifier this check targets
 * @param url target URL to probe
 * @param method HTTP method to use
 * @param timeout request timeout
 * @param expectedStatusCodes expected HTTP status codes
 * @param interval polling interval override
 */
public record HttpHealthCheckConfiguration(
    @Nullable String checkId,
    @Nullable String catalogItemId,
    @Nullable String url,
    @Nullable String method,
    @Nullable Duration timeout,
    @Nullable List<Integer> expectedStatusCodes,
    @Nullable Duration interval)
    implements HealthCheckConfiguration {
  /** Identifies this configuration as an HTTP check. */
  @Nonnull
  @Override
  public HealthCheckType type() {
    return HealthCheckType.HTTP;
  }
}
