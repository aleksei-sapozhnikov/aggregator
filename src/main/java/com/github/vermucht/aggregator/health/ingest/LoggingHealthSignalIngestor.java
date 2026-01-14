package com.github.vermucht.aggregator.health.ingest;

import com.github.vermucht.aggregator.health.model.HealthSignal;
import jakarta.annotation.Nonnull;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

@Component
public class LoggingHealthSignalIngestor implements HealthSignalIngestor {
	private static final Logger LOGGER = LoggerFactory.getLogger(LoggingHealthSignalIngestor.class);

	@Override
	public void ingest(@Nonnull HealthSignal signal) {
		LOGGER.info(
			"Ingested health signal: itemId={} checkId={} status={} source={} observedAt={} message={}",
			signal.catalogItemId(),
			signal.checkId(),
			signal.status(),
			signal.source(),
			signal.observedAt(),
			signal.message()
		);
	}
}
