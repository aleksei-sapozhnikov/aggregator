package com.github.vermucht.aggregator.signalsource.polling;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;

import com.github.vermucht.aggregator.catalog.model.ItemId;
import com.github.vermucht.aggregator.signal.model.HealthSignal;
import com.github.vermucht.aggregator.signal.model.HealthStatus;
import com.github.vermucht.aggregator.signal.state.HealthSignalStateStore;
import com.github.vermucht.aggregator.signal.state.ItemHealthStateStore;
import jakarta.annotation.Nonnull;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.Test;
import org.springframework.scheduling.concurrent.ThreadPoolTaskScheduler;

class PollingSignalSourceSchedulerTest {

  @Test
  void runsOnVirtualThreadsWithBoundedConcurrency() throws InterruptedException {
    int signalCount = 6;
    AtomicInteger active = new AtomicInteger();
    AtomicInteger maxActive = new AtomicInteger();
    AtomicBoolean allVirtual = new AtomicBoolean(true);
    CountDownLatch firstTwoStarted = new CountDownLatch(2);
    CountDownLatch release = new CountDownLatch(1);
    CountDownLatch completed = new CountDownLatch(signalCount);
    ItemId itemId = ItemId.of("test-service");

    List<PollingSignalSource> sources = new ArrayList<>();
    for (int index = 0; index < signalCount; index++) {
      String signalId = "signal-" + index;
      sources.add(
          new StubSignalSource(
              signalId,
              Duration.ofHours(1),
              () -> {
                allVirtual.set(allVirtual.get() && Thread.currentThread().isVirtual());
                int running = active.incrementAndGet();
                maxActive.accumulateAndGet(running, Math::max);
                firstTwoStarted.countDown();
                try {
                  if (!release.await(5, TimeUnit.SECONDS)) {
                    throw new IllegalStateException("Timed out waiting for release");
                  }
                } catch (InterruptedException ex) {
                  Thread.currentThread().interrupt();
                  throw new IllegalStateException("Poll interrupted", ex);
                } finally {
                  active.decrementAndGet();
                  completed.countDown();
                }
                return new HealthSignal(
                    itemId, signalId, HealthStatus.UP, Instant.now(), "http", null, Map.of());
              }));
    }

    ThreadPoolTaskScheduler timer = new ThreadPoolTaskScheduler();
    timer.setPoolSize(2);
    timer.initialize();
    ExecutorService executor = Executors.newVirtualThreadPerTaskExecutor();
    HealthSignalStateStore signals = new HealthSignalStateStore();
    PollingSignalSourceScheduler scheduler =
        new PollingSignalSourceScheduler(
            new PollingSignalSourceRegistry(sources),
            List.of(signals::updateSignal),
            timer,
            executor,
            2,
            mock(ItemHealthStateStore.class),
            signals);
    try {
      scheduler.scheduleSignalSources();
      assertThat(firstTwoStarted.await(3, TimeUnit.SECONDS)).isTrue();
      assertThat(maxActive.get()).isEqualTo(2);
      release.countDown();
      assertThat(completed.await(5, TimeUnit.SECONDS)).isTrue();
      assertThat(allVirtual.get()).isTrue();
      assertThat(maxActive.get()).isEqualTo(2);
    } finally {
      release.countDown();
      scheduler.stopPolling();
      executor.shutdownNow();
      timer.shutdown();
    }
  }

  @Test
  void doesNotRescheduleObsoletePollsAfterRegistryReload() throws InterruptedException {
    CountDownLatch oldStarted = new CountDownLatch(1);
    CountDownLatch releaseOld = new CountDownLatch(1);
    CountDownLatch replacementCompleted = new CountDownLatch(1);
    AtomicInteger obsoleteIngestions = new AtomicInteger();
    ItemId itemId = ItemId.of("test-service");

    PollingSignalSource oldSource =
        new StubSignalSource(
            "old",
            Duration.ofMillis(10),
            () -> {
              oldStarted.countDown();
              try {
                if (!releaseOld.await(5, TimeUnit.SECONDS)) {
                  throw new IllegalStateException("Timed out waiting to release the old poll");
                }
              } catch (InterruptedException ex) {
                Thread.currentThread().interrupt();
                throw new IllegalStateException("Old poll interrupted", ex);
              }
              return new HealthSignal(
                  itemId, "old", HealthStatus.UP, Instant.now(), "http", null, Map.of());
            });
    PollingSignalSource replacementSource =
        new StubSignalSource(
            "new",
            Duration.ofHours(1),
            () -> {
              replacementCompleted.countDown();
              return new HealthSignal(
                  itemId, "new", HealthStatus.UP, Instant.now(), "http", null, Map.of());
            });

    PollingSignalSourceRegistry registry = new PollingSignalSourceRegistry(List.of(oldSource));
    HealthSignalStateStore signals = new HealthSignalStateStore();
    ThreadPoolTaskScheduler timer = new ThreadPoolTaskScheduler();
    timer.setPoolSize(2);
    timer.initialize();
    ExecutorService executor = Executors.newVirtualThreadPerTaskExecutor();
    PollingSignalSourceScheduler scheduler =
        new PollingSignalSourceScheduler(
            registry,
            List.of(
                signal -> {
                  if ("old".equals(signal.id())) {
                    obsoleteIngestions.incrementAndGet();
                  }
                  signals.updateSignal(signal);
                }),
            timer,
            executor,
            1,
            mock(ItemHealthStateStore.class),
            signals);
    try {
      scheduler.scheduleSignalSources();
      assertThat(oldStarted.await(3, TimeUnit.SECONDS)).isTrue();
      registry.replaceSignalSources(List.of(replacementSource));
      scheduler.rescheduleSignalSources();
      releaseOld.countDown();
      assertThat(replacementCompleted.await(3, TimeUnit.SECONDS)).isTrue();
      assertThat(obsoleteIngestions.get()).isZero();
    } finally {
      releaseOld.countDown();
      scheduler.stopPolling();
      executor.shutdownNow();
      timer.shutdown();
    }
  }

  private record StubSignalSource(
      String id, Duration interval, java.util.function.Supplier<HealthSignal> operation)
      implements PollingSignalSource {

    @Nonnull
    @Override
    public String title() {
      return id;
    }

    @Nonnull
    @Override
    public ItemId itemId() {
      return ItemId.of("test-service");
    }

    @Nonnull
    @Override
    public Duration getInterval() {
      return interval;
    }

    @Nonnull
    @Override
    public String source() {
      return "http";
    }

    @Nonnull
    @Override
    public HealthSignal poll() {
      return operation.get();
    }
  }
}
