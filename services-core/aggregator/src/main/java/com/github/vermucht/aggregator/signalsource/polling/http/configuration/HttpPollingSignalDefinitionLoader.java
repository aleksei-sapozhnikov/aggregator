package com.github.vermucht.aggregator.signalsource.polling.http.configuration;

import com.github.vermucht.aggregator.utils.DefinitionLoader;
import jakarta.annotation.Nonnull;
import java.util.List;
import java.util.Objects;
import org.springframework.core.io.Resource;
import org.springframework.core.io.ResourceLoader;
import org.springframework.stereotype.Component;

/** Loads HTTP polling signal configurations from the configured definition resource. */
@Component
public class HttpPollingSignalDefinitionLoader {
  @Nonnull private final HttpPollingSignalProperties properties;
  @Nonnull private final DefinitionLoader definitionLoader;
  @Nonnull private final ResourceLoader resourceLoader;

  /** Creates a loader that reads the HTTP polling signal definition file. */
  public HttpPollingSignalDefinitionLoader(
      @Nonnull HttpPollingSignalProperties properties,
      @Nonnull DefinitionLoader definitionLoader,
      @Nonnull ResourceLoader resourceLoader) {
    this.properties = Objects.requireNonNull(properties, "properties");
    this.definitionLoader = Objects.requireNonNull(definitionLoader, "definitionLoader");
    this.resourceLoader = Objects.requireNonNull(resourceLoader, "resourceLoader");
  }

  /** Loads the HTTP polling signal configurations from the configured resource. */
  @Nonnull
  public List<HttpPollingSignalConfiguration> loadConfigurations() {
    Resource resource = resourceLoader.getResource(properties.getDefinitionPath());
    if (!resource.exists()) {
      throw new IllegalStateException(
          "HTTP polling signal file not found at " + properties.getDefinitionPath());
    }
    Resource schemaResource = resourceLoader.getResource(properties.getSchemaPath());
    if (!schemaResource.exists()) {
      throw new IllegalStateException(
          "HTTP polling signal schema file not found at " + properties.getSchemaPath());
    }
    HttpPollingSignalDefinition definition =
        definitionLoader.loadDefinition(resource, schemaResource, HttpPollingSignalDefinition.class);
    List<HttpPollingSignalConfiguration> signals = definition.signals();
    if (signals == null) {
      throw new IllegalStateException("HTTP polling signal definition must include signals");
    }
    return List.copyOf(signals);
  }
}
