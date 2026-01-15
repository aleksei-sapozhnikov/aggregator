package com.github.vermucht.aggregator.health.model;

/**
 * Enumerates possible health check outcomes.
 */
public enum HealthStatus {
	/**
	 * Health check indicates the target is healthy.
	 */
	UP,
	/**
	 * Health check indicates the target is unhealthy.
	 */
	DOWN,
	/**
	 * Health check result is unknown or indeterminate.
	 */
	UNKNOWN
}
