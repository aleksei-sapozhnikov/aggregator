package com.github.vermucht.aggregator.feedback.configuration;

import jakarta.annotation.PostConstruct;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

/** Validates feedback storage configuration based on selected store type. */
@Component
public class FeedbackStorageConfigurationValidator {
  private final String storeType;
  private final String localFilesPath;
  private final String dynamoTableName;

  public FeedbackStorageConfigurationValidator(
      @Value("${feedback.store-type:local-files}") String storeType,
      @Value("${feedback.local-files.path:}") String localFilesPath,
      @Value("${feedback.dynamo.table-name:}") String dynamoTableName) {
    this.storeType = storeType;
    this.localFilesPath = localFilesPath;
    this.dynamoTableName = dynamoTableName;
  }

  @PostConstruct
  public void validate() {
    if (!StringUtils.hasText(storeType)) {
      throw new IllegalStateException("feedback.store-type must be configured.");
    }
    if ("local-files".equals(storeType)) {
      if (!StringUtils.hasText(localFilesPath)) {
        throw new IllegalStateException(
            "Missing feedback.local-files.path for feedback.store-type=local-files.");
      }
      return;
    }
    if ("dynamo".equals(storeType)) {
      if (!StringUtils.hasText(dynamoTableName)) {
        throw new IllegalStateException(
            "Missing feedback.dynamo.table-name for feedback.store-type=dynamo.");
      }
      return;
    }
    throw new IllegalStateException(
        "Unsupported feedback.store-type: "
            + storeType
            + ". Supported values: local-files, dynamo.");
  }
}
