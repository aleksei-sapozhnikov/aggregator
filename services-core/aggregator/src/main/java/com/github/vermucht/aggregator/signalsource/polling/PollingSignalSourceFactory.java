package com.github.vermucht.aggregator.signalsource.polling;

import com.github.vermucht.aggregator.catalog.model.Catalog;
import com.github.vermucht.aggregator.catalog.model.ItemId;
import com.github.vermucht.aggregator.signalsource.polling.http.HttpPollingSignalSource;
import com.github.vermucht.aggregator.signalsource.polling.http.configuration.HttpPollingSignalConfiguration;
import jakarta.annotation.Nonnull;
import java.net.URI;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import org.springframework.boot.web.client.RestTemplateBuilder;
import org.springframework.http.HttpMethod;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestTemplate;

/** Builds polling signal source instances from typed HTTP polling signal definitions. */
@Component
public class PollingSignalSourceFactory {
  private final RestTemplateBuilder restTemplateBuilder;

  public PollingSignalSourceFactory(@Nonnull RestTemplateBuilder restTemplateBuilder) {
    this.restTemplateBuilder = restTemplateBuilder;
  }

  @Nonnull
  public List<PollingSignalSource> buildSources(
      @Nonnull List<HttpPollingSignalConfiguration> definitions, @Nonnull Catalog catalog) {
    List<PollingSignalSource> signalSources = new ArrayList<>();
    for (HttpPollingSignalConfiguration definition : definitions) {
      signalSources.add(buildHttpSignalSource(definition, catalog));
    }
    return List.copyOf(signalSources);
  }

  @Nonnull
  private PollingSignalSource buildHttpSignalSource(
      @Nonnull HttpPollingSignalConfiguration definition, @Nonnull Catalog catalog) {
    String id = requireText(definition.id(), "id");
    String signalTitle = optionalText(definition.title()).orElse(id);
    String itemIdValue = requireText(definition.itemId(), "itemId");
    ItemId itemId = ItemId.of(itemIdValue);
    if (!catalog.items().containsKey(itemId)) {
      throw new IllegalStateException(
          "Catalog item not found for health signal " + id + ": " + itemId);
    }
    String url = requireText(definition.url(), "url");
    URI uri = URI.create(url);
    String methodValue = requireText(definition.method(), "method");
    HttpMethod method = HttpMethod.valueOf(methodValue.toUpperCase(Locale.ROOT));
    Duration timeout = requireDuration(definition.timeout(), "timeout");
    Duration interval = requireDuration(definition.interval(), "interval");
    if (interval.isZero() || interval.isNegative()) {
      throw new IllegalStateException("Health signal interval must be positive for " + id);
    }
    RestTemplate restTemplate =
        restTemplateBuilder.connectTimeout(timeout).readTimeout(timeout).build();
    return new HttpPollingSignalSource(
        itemId, id, signalTitle, uri, method, interval, restTemplate);
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

  @Nonnull
  private Duration requireDuration(Duration value, String field) {
    if (value == null) {
      throw new IllegalStateException("Health signal must define " + field);
    }
    return value;
  }
}
