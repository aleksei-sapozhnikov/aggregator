package com.github.vermucht.aggregator.health.polling;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.github.vermucht.aggregator.catalog.model.ItemId;
import com.github.vermucht.aggregator.health.model.HealthSignal;
import com.github.vermucht.aggregator.health.model.HealthStatus;
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

/** Polling health check that executes an HTTP request and evaluates the response. */
public final class HttpHealthCheck implements PollingHealthCheck {
  private static final String SOURCE = "http";

  private static final ObjectMapper OBJECT_MAPPER = new ObjectMapper();

  private final ItemId catalogItemId;
  private final String checkId;
  private final URI uri;
  private final HttpMethod method;
  private final Duration interval;
  private final RestTemplate restTemplate;

  /**
   * Creates an HTTP-based polling health check.
   *
   * @param catalogItemId catalog item associated with this check
   * @param checkId identifier for the check
   * @param uri target URI to call
   * @param method HTTP method to use
   * @param interval polling interval for the check
   * @param restTemplate HTTP client to execute the request
   */
  public HttpHealthCheck(
      @Nonnull ItemId catalogItemId,
      @Nonnull String checkId,
      @Nonnull URI uri,
      @Nonnull HttpMethod method,
      @Nonnull Duration interval,
      @Nonnull RestTemplate restTemplate) {
    this.catalogItemId = Objects.requireNonNull(catalogItemId, "catalogItemId");
    this.checkId = Objects.requireNonNull(checkId, "checkId");
    if (checkId.isBlank()) {
      throw new IllegalArgumentException("checkId must not be blank");
    }
    this.uri = Objects.requireNonNull(uri, "uri");
    this.method = Objects.requireNonNull(method, "method");
    this.interval = Objects.requireNonNull(interval, "interval");
    this.restTemplate = Objects.requireNonNull(restTemplate, "restTemplate");
  }

  @Nonnull
  @Override
  public String getCheckId() {
    return checkId;
  }

  @Nonnull
  @Override
  public ItemId getCatalogItemId() {
    return catalogItemId;
  }

  @Nonnull
  @Override
  public Duration getInterval() {
    return interval;
  }

  @Nonnull
  @Override
  public String getSource() {
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
            catalogItemId,
            checkId,
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
            catalogItemId,
            checkId,
            HealthStatus.DOWN,
            observedAt,
            SOURCE,
            message,
            Map.of("statusCode", String.valueOf(statusCode), "url", uri.toString()));
      }

      if (parsedStatus == null || parsedStatus.isBlank()) {
        String message = "Missing 'status' field in response";
        return new HealthSignal(
            catalogItemId,
            checkId,
            HealthStatus.DOWN,
            observedAt,
            SOURCE,
            message,
            Map.of("statusCode", String.valueOf(statusCode), "url", uri.toString()));
      }

      String normalized = parsedStatus.trim().toUpperCase();
      if ("UP".equals(normalized)) {
        return new HealthSignal(
            catalogItemId,
            checkId,
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
            catalogItemId,
            checkId,
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
          catalogItemId,
          checkId,
          HealthStatus.DOWN,
          observedAt,
          SOURCE,
          message,
          Map.of(
              "status", parsedStatus,
              "statusCode", String.valueOf(statusCode),
              "url", uri.toString()));
    } catch (RestClientException ex) {
      String message = ex.getMessage() == null ? "HTTP check failed" : ex.getMessage();
      return new HealthSignal(
          catalogItemId,
          checkId,
          HealthStatus.DOWN,
          observedAt,
          SOURCE,
          message,
          Map.of("url", uri.toString()));
    }
  }
}
