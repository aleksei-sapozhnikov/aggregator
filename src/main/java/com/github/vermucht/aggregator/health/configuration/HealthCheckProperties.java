package com.github.vermucht.aggregator.health.configuration;

import java.time.Duration;
import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * Configuration properties for health checks and their polling defaults.
 */
@ConfigurationProperties("health")
public class HealthCheckProperties {
	private Duration pollInterval = Duration.ofSeconds(30);
	private String checksPath = "classpath:health-checks.yaml";

	/**
	 * Returns the default polling interval for checks.
	 */
	public Duration getPollInterval() {
		return pollInterval;
	}

	/**
	 * Sets the default polling interval for checks.
	 */
	public void setPollInterval(Duration pollInterval) {
		this.pollInterval = pollInterval;
	}

	/**
	 * Returns the path to the health checks definition file.
	 */
	public String getChecksPath() {
		return checksPath;
	}

	/**
	 * Sets the path to the health checks definition file.
	 */
	public void setChecksPath(String checksPath) {
		this.checksPath = checksPath;
	}
}
