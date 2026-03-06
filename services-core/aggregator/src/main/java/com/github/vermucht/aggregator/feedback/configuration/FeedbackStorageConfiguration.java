package com.github.vermucht.aggregator.feedback.configuration;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.github.vermucht.aggregator.feedback.store.DynamoFeedbackStore;
import com.github.vermucht.aggregator.feedback.store.FeedbackStore;
import com.github.vermucht.aggregator.feedback.store.LocalFeedbackStore;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.util.StringUtils;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.dynamodb.DynamoDbClient;

/** Creates feedback storage based on FEEDBACK_STORAGE_CONFIG JSON. */
@Configuration
public class FeedbackStorageConfiguration {

  private static void validateConfig(FeedbackStorageConfig storageConfig) {
    if (storageConfig == null || !StringUtils.hasText(storageConfig.type())) {
      throw new IllegalStateException(
          "FEEDBACK_STORAGE_CONFIG.type must be set to local or dynamo.");
    }
    String storeType = storageConfig.type().trim().toLowerCase();
    if ("local".equals(storeType)) {
      if (storageConfig.local() == null || !StringUtils.hasText(storageConfig.local().path())) {
        throw new IllegalStateException(
            "FEEDBACK_STORAGE_CONFIG.local.path must be set for type=local.");
      }
      return;
    }
    if ("dynamo".equals(storeType)) {
      if (storageConfig.dynamo() == null
          || !StringUtils.hasText(storageConfig.dynamo().tableName())) {
        throw new IllegalStateException(
            "FEEDBACK_STORAGE_CONFIG.dynamo.table_name must be set for type=dynamo.");
      }
      if (!StringUtils.hasText(storageConfig.dynamo().awsRegion())) {
        throw new IllegalStateException(
            "FEEDBACK_STORAGE_CONFIG.dynamo.aws_region must be set for type=dynamo.");
      }
      return;
    }
    throw new IllegalStateException(
        "Unsupported FEEDBACK_STORAGE_CONFIG.type: "
            + storageConfig.type()
            + ". Supported values: local, dynamo.");
  }

  @Bean
  public FeedbackStorageConfig feedbackStorageConfig(
      @Value("${FEEDBACK_STORAGE_CONFIG:}") String rawConfig, ObjectMapper objectMapper) {
    if (!StringUtils.hasText(rawConfig)) {
      throw new IllegalStateException("Missing FEEDBACK_STORAGE_CONFIG.");
    }
    try {
      FeedbackStorageConfig config = objectMapper.readValue(rawConfig, FeedbackStorageConfig.class);
      validateConfig(config);
      return config;
    } catch (JsonProcessingException exception) {
      throw new IllegalStateException("Invalid FEEDBACK_STORAGE_CONFIG JSON.", exception);
    }
  }

  @Bean
  public FeedbackStore feedbackStore(
      FeedbackStorageConfig storageConfig, ObjectMapper objectMapper) {
    String storeType = storageConfig.type().trim().toLowerCase();
    if ("local".equals(storeType)) {
      return new LocalFeedbackStore(objectMapper, storageConfig.local().path().trim());
    }
    if ("dynamo".equals(storeType)) {
      String awsRegion = storageConfig.dynamo().awsRegion().trim();
      return new DynamoFeedbackStore(
          DynamoDbClient.builder().region(Region.of(awsRegion)).build(),
          storageConfig.dynamo().tableName().trim());
    }
    throw new IllegalStateException(
        "Unsupported FEEDBACK_STORAGE_CONFIG.type: "
            + storageConfig.type()
            + ". Supported values: local, dynamo.");
  }
}
