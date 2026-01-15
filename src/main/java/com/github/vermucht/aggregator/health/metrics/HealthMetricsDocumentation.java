package com.github.vermucht.aggregator.health.metrics;

/**
 * Documents the Prometheus metrics contract for health state export.
 *
 * <p>Metric names:
 *
 * <ul>
 *   <li>{@code aggregator_item_health} (gauge)
 * </ul>
 *
 * <p>Labels:
 *
 * <ul>
 *   <li>{@code item_id} - catalog item identifier
 *   <li>{@code item_name} - display name of the item
 *   <li>{@code item_type} - catalog item type
 * </ul>
 *
 * <p>Gauge values:
 *
 * <ul>
 *   <li>{@code 1.0} - {@code UP}
 *   <li>{@code 0.5} - {@code UNKNOWN}
 *   <li>{@code 0.0} - {@code DOWN}
 * </ul>
 */
@SuppressWarnings("unused")
public final class HealthMetricsDocumentation {
  private HealthMetricsDocumentation() {}
}
