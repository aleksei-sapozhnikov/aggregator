package com.github.vermucht.aggregator.health.polling;

import com.github.vermucht.aggregator.catalog.Catalog;
import com.github.vermucht.aggregator.catalog.ItemId;
import com.github.vermucht.aggregator.utils.DefinitionLoader;\
import jakarta.annotation.Nonnull;
import java.net.URI;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Objects;
import java.util.Set;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.boot.web.client.RestTemplateBuilder;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.io.Resource;
import org.springframework.core.io.ResourceLoader;
import org.springframework.http.HttpMethod;
import org.springframework.scheduling.TaskScheduler;
import org.springframework.scheduling.concurrent.ThreadPoolTaskScheduler;
import org.springframework.web.client.RestTemplate;

@Configuration
@EnableConfigurationProperties(HealthCheckProperties.class)
public class HealthCheckConfiguration {
	@Bean
	@Nonnull
	public TaskScheduler healthCheckTaskScheduler() {
		ThreadPoolTaskScheduler scheduler = new ThreadPoolTaskScheduler();
		scheduler.setPoolSize(4);
		scheduler.setThreadNamePrefix("health-check-");
		scheduler.initialize();
		return scheduler;
	}

	@Bean
	@Nonnull
	public List<PollingHealthCheck> pollingHealthChecks(
		@Nonnull HealthCheckProperties properties,
		@Nonnull RestTemplateBuilder restTemplateBuilder,
		@Nonnull Catalog catalog,
		@Nonnull DefinitionLoader definitionLoader,
		@Nonnull ResourceLoader resourceLoader
	) {
		Objects.requireNonNull(properties, "properties");
		Objects.requireNonNull(restTemplateBuilder, "restTemplateBuilder");
		Objects.requireNonNull(catalog, "catalog");
		Objects.requireNonNull(definitionLoader, "definitionLoader");
		Objects.requireNonNull(resourceLoader, "resourceLoader");
		Resource resource = resourceLoader.getResource(properties.getChecksPath());
		if (!resource.exists()) {
			throw new IllegalStateException("Health checks file not found at " + properties.getChecksPath());
		}
		HealthCheckDefinition definition = definitionLoader.loadDefinition(resource, HealthCheckDefinition.class);
		List<HealthCheckDefinition.HttpCheckDefinition> httpChecks = requireList(definition.httpChecks(), "httpChecks");
		List<PollingHealthCheck> checks = new ArrayList<>();
		for (HealthCheckDefinition.HttpCheckDefinition httpDefinition : httpChecks) {
			checks.add(buildHttpCheck(httpDefinition, properties.getPollInterval(), restTemplateBuilder, catalog));
		}
		return List.copyOf(checks);
	}

	@Nonnull
	private PollingHealthCheck buildHttpCheck(
		@Nonnull HealthCheckDefinition.HttpCheckDefinition definition,
		@Nonnull Duration defaultInterval,
		@Nonnull RestTemplateBuilder restTemplateBuilder,
		@Nonnull Catalog catalog
	) {
		String checkId = requireText(definition.checkId(), "checkId");
		String catalogItemId = requireText(definition.catalogItemId(), "catalogItemId");
		ItemId itemId = ItemId.of(catalogItemId);
		if (!catalog.getItems().containsKey(itemId)) {
			throw new IllegalStateException("Catalog item not found for health check " + checkId + ": " + itemId);
		}
		String url = requireText(definition.url(), "url");
		URI uri = URI.create(url);
		String methodValue = requireText(definition.method(), "method");
		HttpMethod method = HttpMethod.valueOf(methodValue.toUpperCase(Locale.ROOT));
		Duration timeout = Objects.requireNonNullElse(definition.timeout(), Duration.ofSeconds(2));
		Duration interval = definition.interval() == null ? defaultInterval : definition.interval();
		if (interval.isZero() || interval.isNegative()) {
			throw new IllegalStateException("Health check interval must be positive for " + checkId);
		}
		List<Integer> expectedStatusCodes = definition.expectedStatusCodes();
		Set<Integer> expectedStatusSet = expectedStatusCodes == null || expectedStatusCodes.isEmpty()
			? Set.of(200)
			: Set.copyOf(expectedStatusCodes);
		RestTemplate restTemplate = restTemplateBuilder
			.setConnectTimeout(timeout)
			.setReadTimeout(timeout)
			.build();
		return new HttpHealthCheck(itemId, checkId, uri, method, interval, expectedStatusSet, restTemplate);
	}

	@Nonnull
	private <T> List<T> requireList(List<T> values, String name) {
		if (values == null) {
			throw new IllegalStateException("Health check definition must include " + name);
		}
		return values;
	}

	@Nonnull
	private String requireText(String value, String field) {
		if (value == null || value.isBlank()) {
			throw new IllegalStateException("Health check must define " + field);
		}
		return value;
	}
}
