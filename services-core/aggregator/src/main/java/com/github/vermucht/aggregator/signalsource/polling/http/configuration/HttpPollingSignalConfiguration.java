package com.github.vermucht.aggregator.signalsource.polling.http.configuration;

import jakarta.annotation.Nullable;
import java.time.Duration;
import java.util.List;

/**
 * Configuration for an HTTP polling signal entry.
 *
 * @param signalId identifier for the emitted signal stream
 * @param name human-readable signal name
 * @param catalogItemId catalog item identifier this source targets
 * @param url target URL to probe
 * @param method HTTP method to use
 * @param timeout request timeout
 * @param expectedStatusCodes expected HTTP status codes
 * @param interval polling interval override
 */
public record HttpPollingSignalConfiguration(
    @Nullable String signalId,
    @Nullable String name,
    @Nullable String catalogItemId,
    @Nullable String url,
    @Nullable String method,
    @Nullable Duration timeout,
    @Nullable List<Integer> expectedStatusCodes,
    @Nullable Duration interval) {}
