package com.github.vermucht.aggregator.catalog;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.dataformat.yaml.YAMLFactory;
import jakarta.annotation.Nonnull;
import java.io.IOException;
import java.io.InputStream;
import java.util.Locale;
import java.util.Objects;
import org.springframework.core.io.Resource;
import org.springframework.stereotype.Component;

/**
 * Loads a catalog definition from JSON or YAML.
 */
@Component
public class CatalogLoader {
	@Nonnull
	private final ObjectMapper jsonMapper;
	@Nonnull
	private final ObjectMapper yamlMapper;

	public CatalogLoader(@Nonnull ObjectMapper objectMapper) {
		this.jsonMapper = Objects.requireNonNull(objectMapper, "objectMapper");
		this.yamlMapper = new ObjectMapper(new YAMLFactory()).findAndRegisterModules();
	}

	@Nonnull
	public CatalogDefinition loadDefinition(@Nonnull Resource resource) {
		Objects.requireNonNull(resource, "resource");
		ObjectMapper mapper = mapperFor(resource);
		try (InputStream inputStream = resource.getInputStream()) {
			CatalogDefinition definition = mapper.readValue(inputStream, CatalogDefinition.class);
			if (definition == null) {
				throw new IllegalStateException("Catalog definition must not be empty");
			}
			return definition;
		} catch (IOException ex) {
			String name = resource.getFilename() == null ? "catalog" : resource.getFilename();
			throw new IllegalStateException("Failed to load catalog from " + name, ex);
		}
	}

	@Nonnull
	private ObjectMapper mapperFor(@Nonnull Resource resource) {
		String filename = resource.getFilename();
		if (filename == null) {
			return jsonMapper;
		}
		String normalized = filename.toLowerCase(Locale.ROOT);
		if (normalized.endsWith(".yaml") || normalized.endsWith(".yml")) {
			return yamlMapper;
		}
		return jsonMapper;
	}
}
