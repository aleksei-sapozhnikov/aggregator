package com.github.vermucht.aggregator.signalsource.polling.http.configuration;

import jakarta.annotation.Nullable;
import java.time.Duration;

/**
 * Configuration for an HTTP polling signal entry.
 *
 * @param id identifier for the emitted signal stream
 * @param title human-readable signal title
 * @param itemId catalog item identifier this source targets
 * @param url target URL to probe
 * @param method HTTP method to use
 * @param timeout request timeout
 * @param interval polling interval override
 */
public record HttpPollingSignalConfiguration(
    @Nullable String id,
    @Nullable String title,
    @Nullable String itemId,
    @Nullable String url,
    @Nullable String method,
    @Nullable Duration timeout,
    @Nullable Duration interval) {}
