package com.github.vermucht.aggregator.health.polling;

import com.github.vermucht.aggregator.catalog.ItemId;
import com.github.vermucht.aggregator.health.model.HealthSignal;
import com.github.vermucht.aggregator.health.model.HealthStatus;
import jakarta.annotation.Nonnull;
import java.net.URI;
import java.time.Duration;
import java.time.Instant;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import org.springframework.http.HttpMethod;
import org.springframework.http.ResponseEntity;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestTemplate;

public final class HttpHealthCheck implements PollingHealthCheck {
	private static final String SOURCE = "http";

	private final ItemId catalogItemId;
	private final String checkId;
	private final URI uri;
	private final HttpMethod method;
	private final Duration interval;
	private final Set<Integer> expectedStatusCodes;
	private final RestTemplate restTemplate;

	public HttpHealthCheck(
		@Nonnull ItemId catalogItemId,
		@Nonnull String checkId,
		@Nonnull URI uri,
		@Nonnull HttpMethod method,
		@Nonnull Duration interval,
		@Nonnull Set<Integer> expectedStatusCodes,
		@Nonnull RestTemplate restTemplate
	) {
		this.catalogItemId = Objects.requireNonNull(catalogItemId, "catalogItemId");
		this.checkId = Objects.requireNonNull(checkId, "checkId");
		if (checkId.isBlank()) {
			throw new IllegalArgumentException("checkId must not be blank");
		}
		this.uri = Objects.requireNonNull(uri, "uri");
		this.method = Objects.requireNonNull(method, "method");
		this.interval = Objects.requireNonNull(interval, "interval");
		this.expectedStatusCodes = Set.copyOf(Objects.requireNonNull(expectedStatusCodes, "expectedStatusCodes"));
		this.restTemplate = Objects.requireNonNull(restTemplate, "restTemplate");
	}

	@Override
	public String getCheckId() {
		return checkId;
	}

	@Override
	public ItemId getCatalogItemId() {
		return catalogItemId;
	}

	@Override
	public Duration getInterval() {
		return interval;
	}

	@Override
	public String getSource() {
		return SOURCE;
	}

	@Override
	public HealthSignal poll() {
		Instant observedAt = Instant.now();
		try {
			ResponseEntity<String> response = restTemplate.exchange(uri, method, null, String.class);
			int statusCode = response.getStatusCode().value();
			if (expectedStatusCodes.contains(statusCode)) {
				return new HealthSignal(
					catalogItemId,
					checkId,
					HealthStatus.UP,
					observedAt,
					SOURCE,
					null,
					Map.of("statusCode", String.valueOf(statusCode), "url", uri.toString())
				);
			}
			String message = "Unexpected status code: " + statusCode;
			return new HealthSignal(
				catalogItemId,
				checkId,
				HealthStatus.DOWN,
				observedAt,
				SOURCE,
				message,
				Map.of("statusCode", String.valueOf(statusCode), "url", uri.toString())
			);
		} catch (RestClientException ex) {
			String message = ex.getMessage() == null ? "HTTP check failed" : ex.getMessage();
			return new HealthSignal(
				catalogItemId,
				checkId,
				HealthStatus.DOWN,
				observedAt,
				SOURCE,
				message,
				Map.of("url", uri.toString())
			);
		}
	}
}
