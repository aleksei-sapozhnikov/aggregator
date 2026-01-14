package com.github.vermucht.aggregator.health.ingest;

import com.github.vermucht.aggregator.health.model.HealthSignal;
import jakarta.annotation.Nonnull;

public interface HealthSignalIngestor {
	void ingest(@Nonnull HealthSignal signal);
}
