package com.github.vermucht.aggregator.health.configuration;

import com.fasterxml.jackson.annotation.JsonSubTypes;
import com.fasterxml.jackson.annotation.JsonTypeInfo;
import jakarta.annotation.Nonnull;

/** Polymorphic health check configuration used to deserialize check definitions. */
@JsonTypeInfo(use = JsonTypeInfo.Id.NAME, property = "type")
@JsonSubTypes({@JsonSubTypes.Type(value = HttpHealthCheckConfiguration.class, name = "http")})
public sealed interface HealthCheckConfiguration permits HttpHealthCheckConfiguration {
  /** Returns the type of health check represented by this configuration. */
  @Nonnull
  HealthCheckType type();
}
