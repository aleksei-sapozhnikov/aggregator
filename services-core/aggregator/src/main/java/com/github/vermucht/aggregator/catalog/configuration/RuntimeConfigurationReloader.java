package com.github.vermucht.aggregator.catalog.configuration;

import com.github.vermucht.aggregator.catalog.model.Catalog;
import com.github.vermucht.aggregator.signalsource.polling.PollingSignalSourceFactory;
import com.github.vermucht.aggregator.signalsource.polling.PollingSignalSourceRegistry;
import com.github.vermucht.aggregator.signalsource.polling.PollingSignalSourceScheduler;
import com.github.vermucht.aggregator.signalsource.polling.http.configuration.HttpPollingSignalDefinitionLoader;
import jakarta.annotation.Nonnull;
import java.util.Objects;
import org.springframework.core.io.Resource;
import org.springframework.core.io.ResourceLoader;
import org.springframework.stereotype.Component;

/**
 * Reloads catalog and polling-signal snapshots from configured file resources.
 *
 * <p>This component is intentionally endpoint-agnostic so future runtime APIs can call it directly.
 */
@Component
public class RuntimeConfigurationReloader {
  private final ResourceLoader resourceLoader;
  private final CatalogProperties catalogProperties;
  private final CatalogLoader catalogLoader;
  private final CatalogValidator catalogValidator;
  private final CatalogRegistry catalogRegistry;
  private final HttpPollingSignalDefinitionLoader signalDefinitionLoader;
  private final PollingSignalSourceFactory signalSourceFactory;
  private final PollingSignalSourceRegistry signalSourceRegistry;
  private final PollingSignalSourceScheduler signalSourceScheduler;

  public RuntimeConfigurationReloader(
      @Nonnull ResourceLoader resourceLoader,
      @Nonnull CatalogProperties catalogProperties,
      @Nonnull CatalogLoader catalogLoader,
      @Nonnull CatalogValidator catalogValidator,
      @Nonnull CatalogRegistry catalogRegistry,
      @Nonnull HttpPollingSignalDefinitionLoader signalDefinitionLoader,
      @Nonnull PollingSignalSourceFactory signalSourceFactory,
      @Nonnull PollingSignalSourceRegistry signalSourceRegistry,
      @Nonnull PollingSignalSourceScheduler signalSourceScheduler) {
    this.resourceLoader = Objects.requireNonNull(resourceLoader, "resourceLoader");
    this.catalogProperties = Objects.requireNonNull(catalogProperties, "catalogProperties");
    this.catalogLoader = Objects.requireNonNull(catalogLoader, "catalogLoader");
    this.catalogValidator = Objects.requireNonNull(catalogValidator, "catalogValidator");
    this.catalogRegistry = Objects.requireNonNull(catalogRegistry, "catalogRegistry");
    this.signalDefinitionLoader =
        Objects.requireNonNull(signalDefinitionLoader, "signalDefinitionLoader");
    this.signalSourceFactory = Objects.requireNonNull(signalSourceFactory, "signalSourceFactory");
    this.signalSourceRegistry =
        Objects.requireNonNull(signalSourceRegistry, "signalSourceRegistry");
    this.signalSourceScheduler =
        Objects.requireNonNull(signalSourceScheduler, "signalSourceScheduler");
  }

  /** Reloads catalog and signals in order, then reschedules polling tasks. */
  public void reloadAll() {
    reloadCatalog();
    reloadSignals();
  }

  /** Reloads catalog snapshot from configured item/dependency resources. */
  public void reloadCatalog() {
    Resource itemsResource =
        requireResource(catalogProperties.getItemsPath(), "Catalog items file");
    Resource dependenciesResource =
        requireResource(catalogProperties.getDependenciesPath(), "Catalog dependencies file");
    Resource itemsSchemaResource =
        requireResource(catalogProperties.getItemsSchemaPath(), "Catalog items schema file");
    Resource dependenciesSchemaResource =
        requireResource(
            catalogProperties.getDependenciesSchemaPath(), "Catalog dependencies schema file");

    Catalog reloadedCatalog =
        catalogValidator.validate(
            catalogLoader.loadDefinition(
                itemsResource,
                dependenciesResource,
                itemsSchemaResource,
                dependenciesSchemaResource));
    catalogRegistry.replaceCatalog(reloadedCatalog);
  }

  /** Reloads signal sources snapshot from configured signal definition and schema. */
  public void reloadSignals() {
    Catalog currentCatalog = catalogRegistry.getCatalog();
    signalSourceRegistry.replaceSignalSources(
        signalSourceFactory.buildSources(
            signalDefinitionLoader.loadConfigurations(), currentCatalog));
    signalSourceScheduler.rescheduleSignalSources();
  }

  @Nonnull
  private Resource requireResource(@Nonnull String location, @Nonnull String logicalName) {
    Resource resource = resourceLoader.getResource(location);
    if (!resource.exists()) {
      throw new IllegalStateException(logicalName + " not found at " + location);
    }
    return resource;
  }
}
