package com.github.vermucht.aggregator.utils;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.dataformat.yaml.YAMLFactory;
import jakarta.annotation.Nonnull;
import java.io.IOException;
import java.io.InputStream;
import java.util.Locale;
import java.util.Objects;
import org.springframework.core.io.Resource;
import org.springframework.stereotype.Component;

/** Loads typed definitions from JSON or YAML resources. */
@Component
public class DefinitionLoader {
  @Nonnull private final ObjectMapper jsonMapper;
  @Nonnull private final ObjectMapper yamlMapper;

  /**
   * Creates a loader configured with a JSON mapper.
   *
   * @param objectMapper object mapper for JSON definitions
   */
  public DefinitionLoader(@Nonnull ObjectMapper objectMapper) {
    this.jsonMapper = Objects.requireNonNull(objectMapper, "objectMapper");
    this.yamlMapper = new ObjectMapper(new YAMLFactory()).findAndRegisterModules();
  }

  /**
   * Reads and deserializes a definition from the given resource.
   *
   * @param resource resource containing a JSON or YAML definition
   * @param type expected definition type
   * @return parsed definition instance
   */
  @Nonnull
  public <T> T loadDefinition(@Nonnull Resource resource, @Nonnull Class<T> type) {
    Objects.requireNonNull(resource, "resource");
    Objects.requireNonNull(type, "type");
    ObjectMapper mapper = mapperFor(resource);
    try (InputStream inputStream = resource.getInputStream()) {
      T definition = mapper.readValue(inputStream, type);
      if (definition == null) {
        throw new IllegalStateException(type.getSimpleName() + " definition must not be empty");
      }
      return definition;
    } catch (IOException ex) {
      String name = resource.getFilename() == null ? "resource" : resource.getFilename();
      throw new IllegalStateException("Failed to load definition from " + name, ex);
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
