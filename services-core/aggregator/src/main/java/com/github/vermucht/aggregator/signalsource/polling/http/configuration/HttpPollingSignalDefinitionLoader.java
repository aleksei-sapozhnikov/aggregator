package com.github.vermucht.aggregator.signalsource.polling.http.configuration;

import com.github.vermucht.aggregator.catalog.configuration.CatalogProperties;
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
  @Nonnull private final CatalogProperties catalogProperties;
  @Nonnull private final DefinitionLoader definitionLoader;
  @Nonnull private final ResourceLoader resourceLoader;

  /** Creates a loader that reads the HTTP polling signal definition file. */
  public HttpPollingSignalDefinitionLoader(
      @Nonnull CatalogProperties catalogProperties,
      @Nonnull DefinitionLoader definitionLoader,
      @Nonnull ResourceLoader resourceLoader) {
    this.catalogProperties = Objects.requireNonNull(catalogProperties, "catalogProperties");
    this.definitionLoader = Objects.requireNonNull(definitionLoader, "definitionLoader");
    this.resourceLoader = Objects.requireNonNull(resourceLoader, "resourceLoader");
  }

  /** Loads the HTTP polling signal configurations from the configured resource. */
  @Nonnull
  public List<HttpPollingSignalConfiguration> loadConfigurations() {
    String definitionUrl = catalogProperties.getSignalsUrl();
    Resource resource = resourceLoader.getResource(definitionUrl);
    if (!resource.exists()) {
      throw new IllegalStateException("HTTP polling signal file not found at " + definitionUrl);
    }
    HttpPollingSignalDefinition definition =
        definitionLoader.loadDefinition(resource, HttpPollingSignalDefinition.class);
    List<HttpPollingSignalConfiguration> signals = definition.signals();
    if (signals == null) {
      throw new IllegalStateException("HTTP polling signal definition must include signals");
    }
    return List.copyOf(signals);
  }
}
