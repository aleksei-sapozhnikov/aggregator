package com.github.vermucht.aggregator.healthcheck.polling;

import com.github.vermucht.aggregator.aggregation.HealthCheckStateStore;
import com.github.vermucht.aggregator.aggregation.HealthStateStore;
import com.github.vermucht.aggregator.healthcheck.ingest.HealthSignalIngestor;
import com.github.vermucht.aggregator.healthcheck.model.HealthSignal;
import jakarta.annotation.Nonnull;
import jakarta.annotation.PostConstruct;
import java.util.List;
import java.util.Objects;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.scheduling.TaskScheduler;
import org.springframework.stereotype.Component;

/** Schedules polling health checks and routes signals to the ingestor. */
@Component
public class PollingHealthCheckScheduler {
  private static final Logger LOGGER = LoggerFactory.getLogger(PollingHealthCheckScheduler.class);

  private final List<PollingHealthCheck> checks;
  private final List<HealthSignalIngestor> ingestors;
  private final TaskScheduler scheduler;
  private final HealthStateStore stateStore;
  private final HealthCheckStateStore checkStateStore;

  /**
   * Creates a scheduler for the configured polling health checks.
   *
   * @param checks checks to schedule
   * @param ingestors ingestors that handle emitted signals
   * @param scheduler task scheduler for fixed-delay execution
   * @param stateStore store for item-level raw health status
   * @param checkStateStore store for per-check health status
   */
  public PollingHealthCheckScheduler(
      @Nonnull List<PollingHealthCheck> checks,
      @Nonnull List<HealthSignalIngestor> ingestors,
      @Nonnull @Qualifier("healthCheckTaskScheduler") TaskScheduler scheduler,
      @Nonnull HealthStateStore stateStore,
      @Nonnull HealthCheckStateStore checkStateStore) {
    this.checks = List.copyOf(Objects.requireNonNull(checks, "checks"));
    this.ingestors = List.copyOf(Objects.requireNonNull(ingestors, "ingestors"));
    this.scheduler = Objects.requireNonNull(scheduler, "scheduler");
    this.stateStore = Objects.requireNonNull(stateStore, "stateStore");
    this.checkStateStore = Objects.requireNonNull(checkStateStore, "checkStateStore");
  }

  /** Starts scheduling the configured health checks after initialization. */
  @PostConstruct
  public void scheduleChecks() {
    for (PollingHealthCheck check : checks) {
      scheduler.scheduleWithFixedDelay(() -> runCheck(check), check.getInterval());
    }
  }

  private void runCheck(PollingHealthCheck check) {
    try {
      HealthSignal signal = check.poll();
      for (HealthSignalIngestor ingestor : ingestors) {
        ingestor.ingest(signal);
      }
      stateStore.updateStatus(
          signal.catalogItemId(), checkStateStore.getAggregatedItemStatus(signal.catalogItemId()));
    } catch (RuntimeException ex) {
      LOGGER.warn("Health check {} failed unexpectedly", check.getCheckId(), ex);
    }
  }
}
