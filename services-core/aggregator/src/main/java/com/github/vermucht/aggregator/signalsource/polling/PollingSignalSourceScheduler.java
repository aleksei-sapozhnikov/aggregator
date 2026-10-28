package com.github.vermucht.aggregator.signalsource.polling;

import com.github.vermucht.aggregator.signal.ingest.HealthSignalConsumer;
import com.github.vermucht.aggregator.signal.model.HealthSignal;
import com.github.vermucht.aggregator.signal.state.HealthSignalStateStore;
import com.github.vermucht.aggregator.signal.state.ItemHealthStateStore;
import jakarta.annotation.Nonnull;
import jakarta.annotation.PostConstruct;
import jakarta.annotation.PreDestroy;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Objects;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.RejectedExecutionException;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.Semaphore;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.TaskScheduler;
import org.springframework.stereotype.Component;

/**
 * Schedules polling without blocking scheduler threads on HTTP I/O.
 *
 * <p>Each signal runs on a virtual thread, with a global concurrency limit. The next poll is
 * scheduled only after the previous poll completes, retaining per-signal fixed-delay semantics.
 */
@Component
public class PollingSignalSourceScheduler {
  private static final Logger LOGGER = LoggerFactory.getLogger(PollingSignalSourceScheduler.class);

  private final PollingSignalSourceRegistry signalSourceRegistry;
  private final List<HealthSignalConsumer> consumers;
  private final TaskScheduler scheduler;
  private final ExecutorService executor;
  private final Semaphore concurrentPolls;
  private final ItemHealthStateStore stateStore;
  private final HealthSignalStateStore signalStateStore;
  private final Object schedulingLock = new Object();
  private final List<ScheduledPoll> scheduledPolls = new ArrayList<>();
  private boolean stopped;

  public PollingSignalSourceScheduler(
      @Nonnull PollingSignalSourceRegistry signalSourceRegistry,
      @Nonnull List<HealthSignalConsumer> consumers,
      @Nonnull @Qualifier("healthSignalTaskScheduler") TaskScheduler scheduler,
      @Nonnull @Qualifier("healthSignalVirtualExecutor") ExecutorService executor,
      @Value("${aggregator.polling.max-concurrency:32}") int maxConcurrency,
      @Nonnull ItemHealthStateStore stateStore,
      @Nonnull HealthSignalStateStore signalStateStore) {
    this.signalSourceRegistry =
        Objects.requireNonNull(signalSourceRegistry, "signalSourceRegistry");
    this.consumers = List.copyOf(Objects.requireNonNull(consumers, "consumers"));
    this.scheduler = Objects.requireNonNull(scheduler, "scheduler");
    this.executor = Objects.requireNonNull(executor, "executor");
    if (maxConcurrency < 1) {
      throw new IllegalArgumentException("Polling max concurrency must be positive");
    }
    this.concurrentPolls = new Semaphore(maxConcurrency, true);
    this.stateStore = Objects.requireNonNull(stateStore, "stateStore");
    this.signalStateStore = Objects.requireNonNull(signalStateStore, "signalStateStore");
  }

  /** Starts scheduling the configured polling sources after initialization. */
  @PostConstruct
  public void scheduleSignalSources() {
    rescheduleSignalSources();
  }

  /** Cancels old schedules and starts polling the latest registry snapshot. */
  public void rescheduleSignalSources() {
    synchronized (schedulingLock) {
      if (stopped) {
        return;
      }
      for (ScheduledPoll poll : scheduledPolls) {
        poll.cancel();
      }
      scheduledPolls.clear();
      for (PollingSignalSource source : signalSourceRegistry.getSignalSources()) {
        ScheduledPoll poll = new ScheduledPoll(source);
        scheduledPolls.add(poll);
        scheduleNext(poll, Duration.ZERO);
      }
    }
  }

  /** Prevents queued work from being rescheduled during shutdown. */
  @PreDestroy
  public void stopPolling() {
    synchronized (schedulingLock) {
      stopped = true;
      for (ScheduledPoll poll : scheduledPolls) {
        poll.cancel();
      }
      scheduledPolls.clear();
    }
  }

  private void scheduleNext(ScheduledPoll poll, Duration delay) {
    synchronized (schedulingLock) {
      if (stopped || poll.cancelled) {
        return;
      }
      poll.future =
          scheduler.schedule(
              () -> dispatch(poll), Instant.now().plus(delay));
    }
  }

  private void dispatch(ScheduledPoll poll) {
    synchronized (schedulingLock) {
      if (stopped || poll.cancelled) {
        return;
      }
      try {
        executor.execute(() -> executePoll(poll));
      } catch (RejectedExecutionException ex) {
        if (!stopped) {
          LOGGER.warn("Could not start health signal source {}", poll.source.id(), ex);
        }
      }
    }
  }

  private void executePoll(ScheduledPoll poll) {
    boolean acquired = false;
    try {
      // Waiting virtual threads are parked; only the configured number may perform I/O.
      concurrentPolls.acquire();
      acquired = true;
      if (!poll.cancelled && !stopped) {
        runSignalSource(poll);
      }
    } catch (InterruptedException ex) {
      Thread.currentThread().interrupt();
    } finally {
      if (acquired) {
        concurrentPolls.release();
      }
      scheduleNext(poll, poll.source.getInterval());
    }
  }

  private void runSignalSource(ScheduledPoll poll) {
    PollingSignalSource source = poll.source;
    try {
      HealthSignal signal = source.poll();
      if (poll.cancelled || stopped) {
        return;
      }
      for (HealthSignalConsumer consumer : consumers) {
        consumer.ingest(signal);
      }
      stateStore.updateStatus(
          signal.itemId(), signalStateStore.getAggregatedItemStatus(signal.itemId()));
    } catch (RuntimeException ex) {
      LOGGER.warn("Health signal source {} failed unexpectedly", source.id(), ex);
    }
  }

  private static final class ScheduledPoll {
    private final PollingSignalSource source;
    private volatile boolean cancelled;
    private ScheduledFuture<?> future;

    private ScheduledPoll(PollingSignalSource source) {
      this.source = source;
    }

    private void cancel() {
      cancelled = true;
      if (future != null) {
        future.cancel(false);
      }
    }
  }
}
