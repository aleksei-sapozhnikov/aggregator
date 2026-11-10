package com.github.vermucht.aggregator.signalsource.polling.http.configuration;

import jakarta.annotation.Nullable;
import java.util.List;

/**
 * Container for HTTP polling signal configurations loaded from a definition file.
 *
 * @param signals list of configured HTTP polling signals
 */
public record HttpPollingSignalDefinition(@Nullable List<HttpPollingSignalConfiguration> signals) {}
