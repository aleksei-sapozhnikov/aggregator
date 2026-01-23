package com.github.vermucht.aggregator.export;

/**
 * Documents the Prometheus metrics contract for health state export.
 *
 * <p>Metric names:
 *
 * <ul>
 *   <li>{@code catalog_item_state} (gauge)
 *   <li>{@code catalog_dependency} (gauge)
 * </ul>
 *
 * <p>Labels:
 *
 * <ul>
 *   <li>{@code item_id} - catalog item identifier
 *   <li>{@code item_name} - display name of the item
 *   <li>{@code item_type} - catalog item type
 *   <li>{@code source_id} - source catalog item identifier
 *   <li>{@code target_id} - target catalog item identifier
 *   <li>{@code dep_type} - dependency classification
 * </ul>
 *
 * <p>Gauge values:
 *
 * <ul>
 *   <li>{@code 1.0} - {@code UP}
 *   <li>{@code 0.5} - {@code UNKNOWN}
 *   <li>{@code 0.0} - {@code DOWN}
 * </ul>
 *
 * <p>Dependency gauge values:
 *
 * <ul>
 *   <li>{@code 1.0} - dependency edge present
 * </ul>
 */
@SuppressWarnings("unused")
public final class HealthMetricsDocumentation {
  private HealthMetricsDocumentation() {}
}
