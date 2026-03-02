package com.github.vermucht.aggregator.signalsource.polling;

import com.github.vermucht.aggregator.signal.ingest.HealthSignalConsumer;
import com.github.vermucht.aggregator.signal.model.HealthSignal;
import com.github.vermucht.aggregator.signal.state.HealthSignalStateStore;
import com.github.vermucht.aggregator.signal.state.ItemHealthStateStore;
import jakarta.annotation.Nonnull;
import jakarta.annotation.PostConstruct;
import java.util.List;
import java.util.Objects;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.scheduling.TaskScheduler;
import org.springframework.stereotype.Component;

/** Schedules polling signal sources and routes signals to consumers. */
@Component
public class PollingSignalSourceScheduler {
  private static final Logger LOGGER = LoggerFactory.getLogger(PollingSignalSourceScheduler.class);

  private final List<PollingSignalSource> signalSources;
  private final List<HealthSignalConsumer> consumers;
  private final TaskScheduler scheduler;
  private final ItemHealthStateStore stateStore;
  private final HealthSignalStateStore signalStateStore;

  /**
   * Creates a scheduler for the configured polling signal sources.
   *
   * @param signalSources sources to schedule
   * @param consumers consumers that handle emitted signals
   * @param scheduler task scheduler for fixed-delay execution
   * @param stateStore store for item-level raw health status
   * @param signalStateStore store for per-signal health status
   */
  public PollingSignalSourceScheduler(
      @Nonnull List<PollingSignalSource> signalSources,
      @Nonnull List<HealthSignalConsumer> consumers,
      @Nonnull @Qualifier("healthSignalTaskScheduler") TaskScheduler scheduler,
      @Nonnull ItemHealthStateStore stateStore,
      @Nonnull HealthSignalStateStore signalStateStore) {
    this.signalSources = List.copyOf(Objects.requireNonNull(signalSources, "signalSources"));
    this.consumers = List.copyOf(Objects.requireNonNull(consumers, "consumers"));
    this.scheduler = Objects.requireNonNull(scheduler, "scheduler");
    this.stateStore = Objects.requireNonNull(stateStore, "stateStore");
    this.signalStateStore = Objects.requireNonNull(signalStateStore, "signalStateStore");
  }

  /** Starts scheduling the configured polling signal sources after initialization. */
  @PostConstruct
  public void scheduleSignalSources() {
    for (PollingSignalSource signalSource : signalSources) {
      scheduler.scheduleWithFixedDelay(
          () -> runSignalSource(signalSource), signalSource.getInterval());
    }
  }

  private void runSignalSource(PollingSignalSource signalSource) {
    try {
      HealthSignal signal = signalSource.poll();
      for (HealthSignalConsumer consumer : consumers) {
        consumer.ingest(signal);
      }
      stateStore.updateStatus(
          signal.catalogItemId(),
          signalStateStore.getAggregatedItemStatus(signal.catalogItemId()));
    } catch (RuntimeException ex) {
      LOGGER.warn("Health signal source {} failed unexpectedly", signalSource.getSignalId(), ex);
    }
  }
}
