package com.github.vermucht.aggregator.signal.ingest;

import com.github.vermucht.aggregator.signal.model.HealthSignal;
import jakarta.annotation.Nonnull;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

/** Consumes health signals by logging them for observability. */
@Component
public class LoggingHealthSignalConsumer implements HealthSignalConsumer {
  private static final Logger LOGGER = LoggerFactory.getLogger(LoggingHealthSignalConsumer.class);

  /**
   * Logs a health signal payload at info level.
   *
   * @param signal health signal to ingest
   */
  @Override
  public void ingest(@Nonnull HealthSignal signal) {
    LOGGER.info(
        "Ingested health signal: itemId={} id={} status={} source={} observedAt={} message={}",
        signal.itemId(),
        signal.id(),
        signal.status(),
        signal.source(),
        signal.observedAt(),
        signal.message());
  }
}
