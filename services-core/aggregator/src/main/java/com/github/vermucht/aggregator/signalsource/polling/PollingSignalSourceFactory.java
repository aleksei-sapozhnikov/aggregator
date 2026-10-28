package com.github.vermucht.aggregator.signalsource.polling;

import com.github.vermucht.aggregator.catalog.model.Catalog;
import com.github.vermucht.aggregator.catalog.model.ItemId;
import com.github.vermucht.aggregator.signalsource.polling.http.HttpPollingSignalSource;
import com.github.vermucht.aggregator.signalsource.polling.http.configuration.HttpPollingSignalConfiguration;
import jakarta.annotation.Nonnull;
import jakarta.annotation.PreDestroy;
import java.net.URI;
import java.net.http.HttpClient;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.http.HttpMethod;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestTemplate;

/** Builds polling signal source instances from typed HTTP polling signal definitions. */
@Component
public class PollingSignalSourceFactory {
  private static final Duration DEFAULT_TIMEOUT = Duration.ofSeconds(2);
  private static final Duration DEFAULT_INTERVAL = Duration.ofSeconds(30);

  // Share connection pools and selector threads across signals with the same connect timeout.
  private final Map<Duration, HttpClient> httpClients = new ConcurrentHashMap<>();

  @PreDestroy
  public void closeHttpClients() {
    httpClients.values().forEach(HttpClient::close);
  }

  int sharedClientCount() {
    return httpClients.size();
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
    String methodValue = optionalText(definition.method()).orElse("GET");
    HttpMethod method = HttpMethod.valueOf(methodValue.toUpperCase(Locale.ROOT));
    Duration timeout = optionalDuration(definition.timeout(), DEFAULT_TIMEOUT);
    Duration interval = optionalDuration(definition.interval(), DEFAULT_INTERVAL);
    if (interval.isZero() || interval.isNegative()) {
      throw new IllegalStateException("Health signal interval must be positive for " + id);
    }
    if (timeout.isZero() || timeout.isNegative()) {
      throw new IllegalStateException("Health signal timeout must be positive for " + id);
    }
    HttpClient httpClient =
        httpClients.computeIfAbsent(
            timeout, value -> HttpClient.newBuilder().connectTimeout(value).build());
    JdkClientHttpRequestFactory requestFactory = new JdkClientHttpRequestFactory(httpClient);
    requestFactory.setReadTimeout(timeout);
    RestTemplate restTemplate = new RestTemplate(requestFactory);
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
  private Duration optionalDuration(Duration value, Duration fallback) {
    if (value == null) {
      return fallback;
    }
    return value;
  }
}
