package com.github.vermucht.aggregator.catalog.configuration;

import com.github.vermucht.aggregator.catalog.model.Catalog;
import jakarta.annotation.Nonnull;
import java.util.Objects;
import java.util.concurrent.atomic.AtomicReference;
import org.springframework.stereotype.Component;

/** Holds the current catalog snapshot and allows atomic replacement for future runtime updates. */
@Component
public class CatalogRegistry {
  private final AtomicReference<Catalog> currentCatalog;

  public CatalogRegistry(@Nonnull Catalog initialCatalog) {
    this.currentCatalog = new AtomicReference<>(Objects.requireNonNull(initialCatalog, "initialCatalog"));
  }

  @Nonnull
  public Catalog getCatalog() {
    return currentCatalog.get();
  }

  public void replaceCatalog(@Nonnull Catalog updatedCatalog) {
    currentCatalog.set(Objects.requireNonNull(updatedCatalog, "updatedCatalog"));
  }
}
