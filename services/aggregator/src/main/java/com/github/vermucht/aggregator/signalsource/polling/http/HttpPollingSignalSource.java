package com.github.vermucht.aggregator.signalsource.polling.http;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.github.vermucht.aggregator.catalog.model.ItemId;
import com.github.vermucht.aggregator.signal.model.HealthSignal;
import com.github.vermucht.aggregator.signal.model.HealthStatus;
import com.github.vermucht.aggregator.signalsource.polling.PollingSignalSource;
import jakarta.annotation.Nonnull;
import java.net.URI;
import java.time.Duration;
import java.time.Instant;
import java.util.Map;
import java.util.Objects;
import org.springframework.http.HttpMethod;
import org.springframework.http.ResponseEntity;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestTemplate;

/** Polling signal source that executes an HTTP request and evaluates the response. */
public final class HttpPollingSignalSource implements PollingSignalSource {
  private static final String SOURCE = "http";

  private static final ObjectMapper OBJECT_MAPPER = new ObjectMapper();

  private final ItemId itemId;
  private final String id;
  private final String title;
  private final URI uri;
  private final HttpMethod method;
  private final Duration interval;
  private final RestTemplate restTemplate;

  /**
   * Creates an HTTP-based polling signal source.
   *
   * @param itemId catalog item associated with this signal source
   * @param id identifier for the signal stream
   * @param title human-readable signal title
   * @param uri target URI to call
   * @param method HTTP method to use
   * @param interval polling interval for the source
   * @param restTemplate HTTP client to execute the request
   */
  public HttpPollingSignalSource(
      @Nonnull ItemId itemId,
      @Nonnull String id,
      @Nonnull String title,
      @Nonnull URI uri,
      @Nonnull HttpMethod method,
      @Nonnull Duration interval,
      @Nonnull RestTemplate restTemplate) {
    this.itemId = Objects.requireNonNull(itemId, "itemId");
    this.id = Objects.requireNonNull(id, "id");
    if (id.isBlank()) {
      throw new IllegalArgumentException("id must not be blank");
    }
    this.title = Objects.requireNonNull(title, "title");
    if (title.isBlank()) {
      throw new IllegalArgumentException("title must not be blank");
    }
    this.uri = Objects.requireNonNull(uri, "uri");
    this.method = Objects.requireNonNull(method, "method");
    this.interval = Objects.requireNonNull(interval, "interval");
    this.restTemplate = Objects.requireNonNull(restTemplate, "restTemplate");
  }

  @Nonnull
  @Override
  public String id() {
    return id;
  }

  @Nonnull
  @Override
  public String title() {
    return title;
  }

  @Nonnull
  @Override
  public ItemId itemId() {
    return itemId;
  }

  @Nonnull
  @Override
  public Duration getInterval() {
    return interval;
  }

  @Nonnull
  @Override
  public String source() {
    return SOURCE;
  }

  @Nonnull
  @Override
  public HealthSignal poll() {
    Instant observedAt = Instant.now();
    try {
      ResponseEntity<String> response = restTemplate.exchange(uri, method, null, String.class);
      int statusCode = response.getStatusCode().value();

      String body = response.getBody();
      if (body == null || body.isBlank()) {
        String message = "Empty response body";
        return new HealthSignal(
            itemId,
            id,
            HealthStatus.DOWN,
            observedAt,
            SOURCE,
            message,
            Map.of("statusCode", String.valueOf(statusCode), "url", uri.toString()));
      }

      String parsedStatus;
      try {
        JsonNode root = OBJECT_MAPPER.readTree(body);
        JsonNode statusNode = root.get("status");
        parsedStatus = statusNode == null ? null : statusNode.asText(null);
      } catch (JsonProcessingException ex) {
        String message = "Invalid JSON response";
        return new HealthSignal(
            itemId,
            id,
            HealthStatus.DOWN,
            observedAt,
            SOURCE,
            message,
            Map.of("statusCode", String.valueOf(statusCode), "url", uri.toString()));
      }

      if (parsedStatus == null || parsedStatus.isBlank()) {
        String message = "Missing 'status' field in response";
        return new HealthSignal(
            itemId,
            id,
            HealthStatus.DOWN,
            observedAt,
            SOURCE,
            message,
            Map.of("statusCode", String.valueOf(statusCode), "url", uri.toString()));
      }

      String normalized = parsedStatus.trim().toUpperCase();
      if ("UP".equals(normalized)) {
        return new HealthSignal(
            itemId,
            id,
            HealthStatus.UP,
            observedAt,
            SOURCE,
            "OK - service is up",
            Map.of(
                "status", "UP",
                "statusCode", String.valueOf(statusCode),
                "url", uri.toString()));
      }

      if ("DOWN".equals(normalized)) {
        return new HealthSignal(
            itemId,
            id,
            HealthStatus.DOWN,
            observedAt,
            SOURCE,
            null,
            Map.of(
                "status", "DOWN",
                "statusCode", String.valueOf(statusCode),
                "url", uri.toString()));
      }

      String message = "Unexpected status value: " + parsedStatus;
      return new HealthSignal(
          itemId,
          id,
          HealthStatus.DOWN,
          observedAt,
          SOURCE,
          message,
          Map.of(
              "status", parsedStatus,
              "statusCode", String.valueOf(statusCode),
              "url", uri.toString()));
    } catch (RestClientException ex) {
      String message = ex.getMessage() == null ? "HTTP signal polling failed" : ex.getMessage();
      return new HealthSignal(
          itemId,
          id,
          HealthStatus.DOWN,
          observedAt,
          SOURCE,
          message,
          Map.of("url", uri.toString()));
    }
  }
}
