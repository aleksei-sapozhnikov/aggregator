package com.github.vermucht.aggregator.health.configuration;

import java.time.Duration;
import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties("health")
public class HealthCheckProperties {
	private Duration pollInterval = Duration.ofSeconds(30);
	private String checksPath = "classpath:health-checks.yaml";

	public Duration getPollInterval() {
		return pollInterval;
	}

	public void setPollInterval(Duration pollInterval) {
		this.pollInterval = pollInterval;
	}

	public String getChecksPath() {
		return checksPath;
	}

	public void setChecksPath(String checksPath) {
		this.checksPath = checksPath;
	}
}
