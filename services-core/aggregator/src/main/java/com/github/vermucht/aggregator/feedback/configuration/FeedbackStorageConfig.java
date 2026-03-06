package com.github.vermucht.aggregator.feedback.configuration;

import com.fasterxml.jackson.annotation.JsonProperty;

/** Parsed value of FEEDBACK_STORAGE_CONFIG environment variable. */
public record FeedbackStorageConfig(String type, LocalStorage local, DynamoStorage dynamo) {
  /** Local file storage settings. */
  public record LocalStorage(String path) {}

  /** DynamoDB storage settings. */
  public record DynamoStorage(
      @JsonProperty("table_name") String tableName, @JsonProperty("aws_region") String awsRegion) {}
}
