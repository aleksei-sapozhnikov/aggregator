package com.github.vermucht.aggregator.feedback.store;

import com.github.vermucht.aggregator.feedback.model.FeedbackEntry;
import jakarta.annotation.Nonnull;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import software.amazon.awssdk.services.dynamodb.DynamoDbClient;
import software.amazon.awssdk.services.dynamodb.model.AttributeValue;
import software.amazon.awssdk.services.dynamodb.model.PutItemRequest;
import software.amazon.awssdk.services.dynamodb.model.ScanRequest;
import software.amazon.awssdk.services.dynamodb.model.ScanResponse;

/** Persists feedback entries in DynamoDB. */
public class DynamoFeedbackStore implements FeedbackStore {
  private final DynamoDbClient dynamoDbClient;
  private final String tableName;

  public DynamoFeedbackStore(@Nonnull DynamoDbClient dynamoDbClient, @Nonnull String tableName) {
    this.dynamoDbClient = dynamoDbClient;
    this.tableName = tableName;
  }

  @Override
  public void save(@Nonnull FeedbackEntry entry) {
    PutItemRequest request =
        PutItemRequest.builder()
            .tableName(tableName)
            .item(
                Map.of(
                    "id", AttributeValue.fromS(entry.id()),
                    "receivedAt", AttributeValue.fromS(entry.receivedAt().toString()),
                    "text", AttributeValue.fromS(entry.text())))
            .build();
    dynamoDbClient.putItem(request);
  }

  @Override
  @Nonnull
  public List<FeedbackEntry> listRecent(int limit) {
    List<Map<String, AttributeValue>> items = new ArrayList<>();
    Map<String, AttributeValue> startKey = null;
    do {
      ScanRequest.Builder requestBuilder = ScanRequest.builder().tableName(tableName);
      if (startKey != null && !startKey.isEmpty()) {
        requestBuilder.exclusiveStartKey(startKey);
      }
      ScanResponse response = dynamoDbClient.scan(requestBuilder.build());
      items.addAll(response.items());
      startKey = response.lastEvaluatedKey();
    } while (startKey != null && !startKey.isEmpty());

    List<FeedbackEntry> entries = new ArrayList<>();
    for (Map<String, AttributeValue> item : items) {
      AttributeValue idValue = item.get("id");
      AttributeValue receivedAtValue = item.get("receivedAt");
      AttributeValue textValue = item.get("text");
      if (idValue == null || receivedAtValue == null || textValue == null) {
        continue;
      }
      String id = idValue.s();
      String receivedAtRaw = receivedAtValue.s();
      String text = textValue.s();
      if (id == null || receivedAtRaw == null || text == null) {
        continue;
      }
      try {
        entries.add(new FeedbackEntry(id, Instant.parse(receivedAtRaw), text));
      } catch (RuntimeException ignored) {
        // Ignore malformed rows.
      }
    }
    entries.sort(Comparator.comparing(FeedbackEntry::receivedAt).reversed());
    if (entries.size() <= limit) {
      return List.copyOf(entries);
    }
    return List.copyOf(entries.subList(0, limit));
  }
}
