package com.github.vermucht.aggregator.healthcheck.polling;

import com.github.vermucht.aggregator.aggregation.HealthStateStore;
import com.github.vermucht.aggregator.healthcheck.ingest.HealthSignalIngestor;
import com.github.vermucht.aggregator.healthcheck.model.HealthSignal;
import jakarta.annotation.Nonnull;
import jakarta.annotation.PostConstruct;
import java.util.List;
import java.util.Objects;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
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

  /**
   * Creates a scheduler for the configured polling health checks.
   *
   * @param checks checks to schedule
   * @param ingestor ingestor that handles emitted signals
   * @param scheduler task scheduler for fixed-delay execution
   */
  public PollingHealthCheckScheduler(
      @Nonnull List<PollingHealthCheck> checks,
      @Nonnull List<HealthSignalIngestor> ingestors,
      @Nonnull TaskScheduler scheduler,
      @Nonnull HealthStateStore stateStore) {
    this.checks = List.copyOf(Objects.requireNonNull(checks, "checks"));
    this.ingestors = List.copyOf(Objects.requireNonNull(ingestors, "ingestors"));
    this.scheduler = Objects.requireNonNull(scheduler, "scheduler");
    this.stateStore = Objects.requireNonNull(stateStore, "stateStore");
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
      stateStore.updateStatus(signal.catalogItemId(), signal.status());
      for (HealthSignalIngestor ingestor : ingestors) {
        ingestor.ingest(signal);
      }
    } catch (RuntimeException ex) {
      LOGGER.warn("Health check {} failed unexpectedly", check.getCheckId(), ex);
    }
  }
}
