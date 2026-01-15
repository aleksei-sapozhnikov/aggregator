package com.github.vermucht.aggregator.health.configuration;

import com.github.vermucht.aggregator.utils.DefinitionLoader;
import jakarta.annotation.Nonnull;
import java.util.List;
import java.util.Objects;
import org.springframework.core.io.Resource;
import org.springframework.core.io.ResourceLoader;
import org.springframework.stereotype.Component;

/** Loads health check configurations from the configured definition resource. */
@Component
public class HealthCheckDefinitionLoader {
  @Nonnull private final HealthCheckProperties properties;
  @Nonnull private final DefinitionLoader definitionLoader;
  @Nonnull private final ResourceLoader resourceLoader;

  /** Creates a loader that reads the health check definition file. */
  public HealthCheckDefinitionLoader(
      @Nonnull HealthCheckProperties properties,
      @Nonnull DefinitionLoader definitionLoader,
      @Nonnull ResourceLoader resourceLoader) {
    this.properties = Objects.requireNonNull(properties, "properties");
    this.definitionLoader = Objects.requireNonNull(definitionLoader, "definitionLoader");
    this.resourceLoader = Objects.requireNonNull(resourceLoader, "resourceLoader");
  }

  /** Loads the health check configurations from the configured resource. */
  @Nonnull
  public List<HealthCheckConfiguration> loadConfigurations() {
    Resource resource = resourceLoader.getResource(properties.getChecksPath());
    if (!resource.exists()) {
      throw new IllegalStateException(
          "Health checks file not found at " + properties.getChecksPath());
    }
    HealthCheckDefinition definition =
        definitionLoader.loadDefinition(resource, HealthCheckDefinition.class);
    List<HealthCheckConfiguration> checks = definition.checks();
    if (checks == null) {
      throw new IllegalStateException("Health check definition must include checks");
    }
    return List.copyOf(checks);
  }
}
