package com.github.vermucht.aggregator.utils;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
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
      JsonNode rootNode = mapper.readTree(inputStream);
      T definition = mapper.treeToValue(rootNode, type);
      if (definition == null) {
        throw new IllegalStateException(type.getSimpleName() + " definition must not be empty");
      }
      return definition;
    } catch (IOException ex) {
      String name = resource.getFilename() == null ? "resource" : resource.getFilename();
      throw new IllegalStateException("Failed to load definition from " + name, ex);
    }
  }

  /**
   * Reads and deserializes a definition from the given resource, applying schema defaults first.
   *
   * @param resource resource containing a JSON or YAML definition
   * @param schemaResource resource containing a JSON Schema
   * @param type expected definition type
   * @return parsed definition instance with schema defaults materialized
   */
  @Nonnull
  public <T> T loadDefinition(
      @Nonnull Resource resource, @Nonnull Resource schemaResource, @Nonnull Class<T> type) {
    Objects.requireNonNull(resource, "resource");
    Objects.requireNonNull(schemaResource, "schemaResource");
    Objects.requireNonNull(type, "type");

    ObjectMapper definitionMapper = mapperFor(resource);
    ObjectMapper schemaMapper = mapperFor(schemaResource);

    try (InputStream definitionStream = resource.getInputStream();
        InputStream schemaStream = schemaResource.getInputStream()) {
      JsonNode definitionNode = definitionMapper.readTree(definitionStream);
      JsonNode schemaNode = schemaMapper.readTree(schemaStream);
      if (definitionNode == null) {
        throw new IllegalStateException(type.getSimpleName() + " definition must not be empty");
      }
      JsonNode materialized = definitionNode.deepCopy();
      applyDefaults(materialized, schemaNode);
      T definition = definitionMapper.treeToValue(materialized, type);
      if (definition == null) {
        throw new IllegalStateException(type.getSimpleName() + " definition must not be empty");
      }
      return definition;
    } catch (IOException ex) {
      String name = resource.getFilename() == null ? "resource" : resource.getFilename();
      throw new IllegalStateException(
          "Failed to load definition with schema defaults from " + name, ex);
    }
  }

  private void applyDefaults(@Nonnull JsonNode target, @Nonnull JsonNode schema) {
    if (target.isObject()) {
      JsonNode propertiesNode = schema.get("properties");
      if (propertiesNode != null && propertiesNode.isObject()) {
        ObjectNode objectNode = (ObjectNode) target;
        propertiesNode
            .fields()
            .forEachRemaining(
                entry -> {
                  String propertyName = entry.getKey();
                  JsonNode propertySchema = entry.getValue();
                  JsonNode currentValue = objectNode.get(propertyName);
                  if ((currentValue == null || currentValue.isNull())
                      && propertySchema.has("default")) {
                    currentValue = propertySchema.get("default").deepCopy();
                    objectNode.set(propertyName, currentValue);
                  }
                  if (currentValue != null && !currentValue.isNull()) {
                    applyDefaults(currentValue, propertySchema);
                  }
                });
      }
      return;
    }

    if (target.isArray()) {
      JsonNode itemsSchema = schema.get("items");
      if (itemsSchema == null) {
        return;
      }
      for (JsonNode item : target) {
        applyDefaults(item, itemsSchema);
      }
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
