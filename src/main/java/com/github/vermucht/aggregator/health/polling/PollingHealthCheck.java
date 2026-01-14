package com.github.vermucht.aggregator.health.polling;

import com.github.vermucht.aggregator.catalog.ItemId;
import com.github.vermucht.aggregator.health.model.HealthSignal;
import jakarta.annotation.Nonnull;
import java.time.Duration;

public interface PollingHealthCheck {
	@Nonnull
	String getCheckId();

	@Nonnull
	ItemId getCatalogItemId();

	@Nonnull
	Duration getInterval();

	@Nonnull
	String getSource();

	@Nonnull
	HealthSignal poll();
}
