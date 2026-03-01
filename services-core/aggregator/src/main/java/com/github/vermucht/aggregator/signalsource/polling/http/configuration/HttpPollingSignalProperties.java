package com.github.vermucht.aggregator.signalsource.polling.http.configuration;

import java.time.Duration;
import org.springframework.boot.context.properties.ConfigurationProperties;

/** Configuration properties for HTTP polling signal sources. */
@ConfigurationProperties("health.http-poll")
public class HttpPollingSignalProperties {
  private Duration pollInterval = Duration.ofSeconds(30);
  private String definitionPath = "";

  /** Returns the default polling interval for HTTP polling signal sources. */
  public Duration getPollInterval() {
    return pollInterval;
  }

  /** Sets the default polling interval for HTTP polling signal sources. */
  public void setPollInterval(Duration pollInterval) {
    this.pollInterval = pollInterval;
  }

  /** Returns the path to the HTTP polling signal definition file. */
  public String getDefinitionPath() {
    return definitionPath;
  }

  /** Sets the path to the HTTP polling signal definition file. */
  public void setDefinitionPath(String definitionPath) {
    this.definitionPath = definitionPath;
  }
}
