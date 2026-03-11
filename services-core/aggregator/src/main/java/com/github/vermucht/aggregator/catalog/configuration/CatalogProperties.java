package com.github.vermucht.aggregator.catalog.configuration;

import org.springframework.boot.context.properties.ConfigurationProperties;

/** Configuration properties for catalog definition and schema resources. */
@ConfigurationProperties("catalog")
public class CatalogProperties {
  private String itemsPath = "";
  private String dependenciesPath = "";
  private String itemsSchemaPath = "";
  private String dependenciesSchemaPath = "";

  public String getItemsPath() {
    return itemsPath;
  }

  public void setItemsPath(String itemsPath) {
    this.itemsPath = itemsPath;
  }

  public String getDependenciesPath() {
    return dependenciesPath;
  }

  public void setDependenciesPath(String dependenciesPath) {
    this.dependenciesPath = dependenciesPath;
  }

  public String getItemsSchemaPath() {
    return itemsSchemaPath;
  }

  public void setItemsSchemaPath(String itemsSchemaPath) {
    this.itemsSchemaPath = itemsSchemaPath;
  }

  public String getDependenciesSchemaPath() {
    return dependenciesSchemaPath;
  }

  public void setDependenciesSchemaPath(String dependenciesSchemaPath) {
    this.dependenciesSchemaPath = dependenciesSchemaPath;
  }
}
