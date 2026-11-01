package com.github.vermucht.aggregator.catalog.configuration;

import java.util.Objects;
import org.springframework.boot.context.properties.ConfigurationProperties;

/** Configuration properties for catalog service access. */
@ConfigurationProperties("catalog")
public class CatalogProperties {
  private String baseUrl = "http://catalog:8080";

  public String getBaseUrl() {
    return baseUrl;
  }

  public void setBaseUrl(String baseUrl) {
    this.baseUrl = Objects.requireNonNullElse(baseUrl, "").trim();
  }

  public String getItemsUrl() {
    return withPath("/api/catalog/items");
  }

  public String getDependenciesUrl() {
    return withPath("/api/catalog/dependencies");
  }

  public String getSignalsUrl() {
    return withPath("/api/signals/http-poll");
  }

  private String withPath(String path) {
    String normalized =
        baseUrl.endsWith("/") ? baseUrl.substring(0, baseUrl.length() - 1) : baseUrl;
    return normalized + path;
  }
}
