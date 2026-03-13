package com.github.vermucht.aggregator.signalsource.polling.http.configuration;

import org.springframework.boot.context.properties.ConfigurationProperties;

/** Configuration properties for HTTP polling signal sources. */
@ConfigurationProperties("health.http-poll")
public class HttpPollingSignalProperties {
  private String definitionPath = "";
  private String schemaPath = "";

  /** Returns the path to the HTTP polling signal definition file. */
  public String getDefinitionPath() {
    return definitionPath;
  }

  /** Sets the path to the HTTP polling signal definition file. */
  public void setDefinitionPath(String definitionPath) {
    this.definitionPath = definitionPath;
  }

  /** Returns the path to the HTTP polling signal schema file. */
  public String getSchemaPath() {
    return schemaPath;
  }

  /** Sets the path to the HTTP polling signal schema file. */
  public void setSchemaPath(String schemaPath) {
    this.schemaPath = schemaPath;
  }
}
