package com.github.vermucht.aggregator.health.configuration;

import com.fasterxml.jackson.annotation.JsonSubTypes;
import com.fasterxml.jackson.annotation.JsonTypeInfo;
import jakarta.annotation.Nonnull;

@JsonTypeInfo(use = JsonTypeInfo.Id.NAME, property = "type")
@JsonSubTypes({
	@JsonSubTypes.Type(value = HttpHealthCheckConfiguration.class, name = "http")
})
public sealed interface HealthCheckConfiguration
	permits HttpHealthCheckConfiguration {
	@Nonnull
	HealthCheckType type();
}
