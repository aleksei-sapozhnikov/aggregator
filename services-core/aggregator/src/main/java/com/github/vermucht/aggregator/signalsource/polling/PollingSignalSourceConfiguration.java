package com.github.vermucht.aggregator.signalsource.polling;

import com.github.vermucht.aggregator.catalog.model.Catalog;
import com.github.vermucht.aggregator.catalog.model.ItemId;
import com.github.vermucht.aggregator.signalsource.polling.http.HttpPollingSignalSource;
import com.github.vermucht.aggregator.signalsource.polling.http.configuration.HttpPollingSignalConfiguration;
import com.github.vermucht.aggregator.signalsource.polling.http.configuration.HttpPollingSignalDefinitionLoader;
import com.github.vermucht.aggregator.signalsource.polling.http.configuration.HttpPollingSignalProperties;
import jakarta.annotation.Nonnull;
import java.net.URI;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Objects;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.boot.web.client.RestTemplateBuilder;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.scheduling.TaskScheduler;
import org.springframework.scheduling.concurrent.ThreadPoolTaskScheduler;
import org.springframework.web.client.RestTemplate;

/** Spring configuration that wires polling signal sources from typed definitions. */
@Configuration
@EnableConfigurationProperties(HttpPollingSignalProperties.class)
public class PollingSignalSourceConfiguration {
  /** Creates the task scheduler used for polling signal sources. */
  @Bean
  @Nonnull
  public TaskScheduler healthSignalTaskScheduler() {
    ThreadPoolTaskScheduler scheduler = new ThreadPoolTaskScheduler();
    scheduler.setPoolSize(4);
    scheduler.setThreadNamePrefix("health-signal-");
    scheduler.initialize();
    return scheduler;
  }

  /** Builds polling signal sources from the loaded HTTP polling signal configurations. */
  @Bean
  @Nonnull
  public List<PollingSignalSource> pollingSignalSources(
      @Nonnull HttpPollingSignalProperties properties,
      @Nonnull RestTemplateBuilder restTemplateBuilder,
      @Nonnull Catalog catalog,
      @Nonnull HttpPollingSignalDefinitionLoader definitionLoader) {
    Objects.requireNonNull(properties, "properties");
    Objects.requireNonNull(restTemplateBuilder, "restTemplateBuilder");
    Objects.requireNonNull(catalog, "catalog");
    Objects.requireNonNull(definitionLoader, "definitionLoader");
    List<HttpPollingSignalConfiguration> configurations = definitionLoader.loadConfigurations();
    List<PollingSignalSource> signalSources = new ArrayList<>();
    for (HttpPollingSignalConfiguration configuration : configurations) {
      signalSources.add(
          buildHttpSignalSource(
              configuration, properties.getPollInterval(), restTemplateBuilder, catalog));
    }
    return List.copyOf(signalSources);
  }

  @Nonnull
  private PollingSignalSource buildHttpSignalSource(
      @Nonnull HttpPollingSignalConfiguration definition,
      @Nonnull Duration defaultInterval,
      @Nonnull RestTemplateBuilder restTemplateBuilder,
      @Nonnull Catalog catalog) {
    String signalId = requireText(definition.signalId(), "signalId");
    String signalName = optionalText(definition.name()).orElse(signalId);
    String catalogItemId = requireText(definition.catalogItemId(), "catalogItemId");
    ItemId itemId = ItemId.of(catalogItemId);
    if (!catalog.items().containsKey(itemId)) {
      throw new IllegalStateException(
          "Catalog item not found for health signal " + signalId + ": " + itemId);
    }
    String url = requireText(definition.url(), "url");
    URI uri = URI.create(url);
    String methodValue = requireText(definition.method(), "method");
    HttpMethod method = HttpMethod.valueOf(methodValue.toUpperCase(Locale.ROOT));
    Duration timeout = Objects.requireNonNullElse(definition.timeout(), Duration.ofSeconds(2));
    Duration interval = definition.interval() == null ? defaultInterval : definition.interval();
    if (interval.isZero() || interval.isNegative()) {
      throw new IllegalStateException("Health signal interval must be positive for " + signalId);
    }
    RestTemplate restTemplate =
        restTemplateBuilder.connectTimeout(timeout).readTimeout(timeout).build();
    return new HttpPollingSignalSource(
        itemId, signalId, signalName, uri, method, interval, restTemplate);
  }

  @Nonnull
  private String requireText(String value, String field) {
    if (value == null || value.isBlank()) {
      throw new IllegalStateException("Health signal must define " + field);
    }
    return value;
  }

  @Nonnull
  private java.util.Optional<String> optionalText(String value) {
    if (value == null || value.isBlank()) {
      return java.util.Optional.empty();
    }
    return java.util.Optional.of(value);
  }
}
