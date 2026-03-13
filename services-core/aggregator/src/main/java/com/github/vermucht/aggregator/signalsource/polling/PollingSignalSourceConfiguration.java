package com.github.vermucht.aggregator.signalsource.polling;

import com.github.vermucht.aggregator.catalog.model.Catalog;
import com.github.vermucht.aggregator.signalsource.polling.http.configuration.HttpPollingSignalDefinitionLoader;
import com.github.vermucht.aggregator.signalsource.polling.http.configuration.HttpPollingSignalProperties;
import jakarta.annotation.Nonnull;
import java.util.List;
import java.util.Objects;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.TaskScheduler;
import org.springframework.scheduling.concurrent.ThreadPoolTaskScheduler;

/** Spring configuration that wires polling signal sources from typed definitions. */
@Configuration
@EnableConfigurationProperties(HttpPollingSignalProperties.class)
public class PollingSignalSourceConfiguration {
  /** Creates the task scheduler used for polling signal sources. */
  @Bean
  @Nonnull
  public TaskScheduler healthSignalTaskScheduler() {
    ThreadPoolTaskScheduler scheduler = new ThreadPoolTaskScheduler();
    scheduler.setPoolSize(4);
    scheduler.setThreadNamePrefix("health-signal-");
    scheduler.initialize();
    return scheduler;
  }

  /** Builds polling signal sources from the loaded HTTP polling signal configurations. */
  @Bean
  @Nonnull
  public List<PollingSignalSource> pollingSignalSources(
      @Nonnull PollingSignalSourceFactory signalSourceFactory,
      @Nonnull Catalog catalog,
      @Nonnull HttpPollingSignalDefinitionLoader definitionLoader) {
    Objects.requireNonNull(signalSourceFactory, "signalSourceFactory");
    Objects.requireNonNull(catalog, "catalog");
    Objects.requireNonNull(definitionLoader, "definitionLoader");
    return signalSourceFactory.buildSources(definitionLoader.loadConfigurations(), catalog);
  }
}
