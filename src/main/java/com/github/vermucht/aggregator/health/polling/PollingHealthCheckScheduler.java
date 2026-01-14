package com.github.vermucht.aggregator.health.polling;

import com.github.vermucht.aggregator.health.ingest.HealthSignalIngestor;
import com.github.vermucht.aggregator.health.model.HealthSignal;
import jakarta.annotation.Nonnull;
import jakarta.annotation.PostConstruct;
import java.util.List;
import java.util.Objects;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.TaskScheduler;
import org.springframework.stereotype.Component;

@Component
public class PollingHealthCheckScheduler {
	private static final Logger LOGGER = LoggerFactory.getLogger(PollingHealthCheckScheduler.class);

	private final List<PollingHealthCheck> checks;
	private final HealthSignalIngestor ingestor;
	private final TaskScheduler scheduler;

	public PollingHealthCheckScheduler(
		@Nonnull List<PollingHealthCheck> checks,
		@Nonnull HealthSignalIngestor ingestor,
		@Nonnull TaskScheduler scheduler
	) {
		this.checks = List.copyOf(Objects.requireNonNull(checks, "checks"));
		this.ingestor = Objects.requireNonNull(ingestor, "ingestor");
		this.scheduler = Objects.requireNonNull(scheduler, "scheduler");
	}

	@PostConstruct
	public void scheduleChecks() {
		for (PollingHealthCheck check : checks) {
			scheduler.scheduleWithFixedDelay(() -> runCheck(check), check.getInterval());
		}
	}

	private void runCheck(PollingHealthCheck check) {
		try {
			HealthSignal signal = check.poll();
			ingestor.ingest(signal);
		} catch (RuntimeException ex) {
			LOGGER.warn("Health check {} failed unexpectedly", check.getCheckId(), ex);
		}
	}
}
